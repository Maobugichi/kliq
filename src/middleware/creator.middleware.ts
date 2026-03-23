import type { Request, Response, NextFunction } from "express";
import { findCreatorByUserId } from "../services/creator.services.js";
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

    if (!profile) {
      return res.status(403).json({
        success: false,
        message: "Creator profile not found. Apply to become a creator first.",
      });
    }

    if (profile.status === CreatorStatus.PENDING) {
      return res.status(403).json({
        success: false,
        message: "Your creator account is pending approval",
      });
    }

    if (profile.status === CreatorStatus.REJECTED) {
      return res.status(403).json({
        success: false,
        message: "Your creator account application was rejected",
      });
    }

    if (profile.status === CreatorStatus.SUSPENDED) {
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