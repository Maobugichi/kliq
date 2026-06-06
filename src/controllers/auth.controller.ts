import type { Request, Response } from "express";
import {
  signupService,
  loginService,
  logoutService,
  logoutAllService,
  refreshTokenService,
  type LoginInput,
  type SignupInput,
  completeOnboardingService,
} from "../services/auth.service.js";

type SignupBody = SignupInput;
type LoginBody = LoginInput;

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  maxAge: 1000 * 60 * 15, 
  domain: ".outray.app"
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  maxAge: 1000 * 60 * 60 * 24 * 30, 
  domain: ".outray.app"
};

const COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  domain: ".outray.app",
  // ❌ no maxAge here — that's the bug
};

export const signup = async (
  req: Request<{}, {}, SignupBody>,
  res: Response
) => {
  try {
    const { email, password } = req.body;
    const result = await signupService({ email, password });

    res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

    return res.status(201).json({
      message: result.message,
      user: result.user,
    });
  } catch (err: any) {
    if (err.message === "An account with this email already exists") {
      return res.status(409).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const completeOnboarding = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { role, name, storeSlug } = req.body;

    const result = await completeOnboardingService(userId, { role, name, storeSlug });

    // Re-issue access token with the role now set
    res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);

    return res.status(200).json({ user: result.user });
  } catch (err: any) {
    if (err.message === "Slug already taken") {
      return res.status(409).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const login = async (
  req: Request<{}, {}, LoginBody>,
  res: Response
) => {
  try {
    const { email, password } = req.body;
    const result = await loginService({ email, password });

    res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

    return res.status(200).json({
      user: result.user,
    });
  } catch (err: any) {
    if (err.message === "Invalid credentials") {
      return res.status(401).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const result = await refreshTokenService({ refreshToken: token });

    // Re-issue access token cookie
    res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      user: result.user,
    });
  } catch (err) {
    console.error("Refresh token error", err);
    if (err instanceof Error && err.message === "Invalid refresh token") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to refresh token",
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const result = await logoutService({ refreshToken: token });

    res.clearCookie("accessToken", COOKIE_CLEAR_OPTIONS);
    res.clearCookie("refreshToken", COOKIE_CLEAR_OPTIONS);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error("Logout error:", err);
    if (
      err instanceof Error &&
      err.message === "Invalid or already revoked refresh token"
    ) {
      return res.status(401).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};

export const logoutAllController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await logoutAllService({ userId });

    res.clearCookie("accessToken", ACCESS_COOKIE_OPTIONS);
    res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: { tokensRevoked: result.tokensRevoked },
    });
  } catch (err) {
    console.error("Logout all error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to logout from all devices",
    });
  }
};