import type { Request, Response, NextFunction } from "express";
import { findCreatorByUserId } from "../services/creator.service.js";
import { CreatorStatus } from "../types.ts/creator.types.js";

export const requireActiveCreator = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const profile = await findCreatorByUserId(req.user.id);
   

    if (profile?.status === CreatorStatus.SUSPENDED) {
      return res.status(403).json({
        success: false,
        message: "Your creator account has been suspended",
        reason: profile.suspended_reason,
        suspended_at: profile.suspended_at,
      });
    }

    next();
  } catch (err) {
    console.error("requireActiveCreator error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to verify creator status",
    });
  }
};