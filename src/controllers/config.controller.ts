import type { Request, Response } from "express";
import { getAllConfig, setConfig, getPlatformFee } from "../services/config.service.js";

// GET /admin/config — view all platform config
export const listConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getAllConfig();
    return res.status(200).json({ success: true, data: config });
  } catch (err) {
    console.error("listConfig error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// PATCH /admin/config/platform-fee
export const updatePlatformFee = async (req: Request, res: Response) => {
  try {
    const { fee } = req.body as { fee?: number };

    if (fee === undefined || fee === null) {
      return res.status(400).json({ success: false, message: "fee is required" });
    }

    if (typeof fee !== "number" || isNaN(fee) || fee < 0 || fee >= 1) {
      return res.status(400).json({
        success: false,
        message: "fee must be a number between 0 and 0.99 (e.g. 0.07 for 7%)",
      });
    }

    await setConfig("platform_fee", fee.toString());

    return res.status(200).json({
      success: true,
      message: `Platform fee updated to ${(fee * 100).toFixed(1)}%`,
      data: { platform_fee: fee },
    });
  } catch (err) {
    console.error("updatePlatformFee error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};