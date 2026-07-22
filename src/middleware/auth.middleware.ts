import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/token.util.js";

export const requireVerifiedEmail = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.email_verified) {
    res.status(403).json({
      success: false,
      message: "Please verify your email before continuing",
    });
    return;
  }
  next();
};

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
):void => {
  // Read from cookie first, fall back to Authorization header
  const token =
    req.cookies?.accessToken ?? req.headers.authorization?.split(" ")[1];

  if (!token) {
     res.status(401).json({
      success: false,
      message: "Access token required",
    });

    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role as "creator" | "buyer" | "admin",
      email_verified: payload.email_verified,

    };
    next();
  } catch {
     res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
    return;
  }
};

export const authenticateOptional = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const token =
    req.cookies?.accessToken ?? req.headers.authorization?.split(" ")[1];

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = {
        id: payload.id,
        email: payload.email,
        role: payload.role as "creator" | "buyer" | "admin",
        email_verified: payload.email_verified,
      };
    } catch {}
  }

  next();
};

export const authorizeRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction):void => {
    if (!req.user) {
       res.status(401).json({
        success: false,
        message: "Authentication required",
      });

      return;
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
       res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
      return;
    }

    next();
  };
};