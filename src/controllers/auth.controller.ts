import type { Request, Response } from "express";
import {
  signupService,
  loginService,
  logoutService,
  logoutAllService,
  refreshTokenService,
  type LoginInput,
  type SignupInput,
  
} from "../services/auth.service.js";

type SignupBody = SignupInput;
type LoginBody = LoginInput;

export const signup = async (
  req: Request<{}, {}, SignupBody>,
  res: Response
) => {
  try {
    const { email, name, password , role } = req.body;
    const result = await signupService({ email, name, password, role });
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.message === "Email already in use") {
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
    return res.status(201).json(result);
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
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const result = await refreshTokenService({ refreshToken });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: result,
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
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const result = await logoutService({ refreshToken });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

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
      return res.status(401).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
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

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

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



