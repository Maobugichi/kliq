import type { Request, Response } from "express";
import { redeemAccessToken } from "../services/access-token.service.js";

// GET /download/:token
export const downloadFile = async (req: Request, res: Response) => {
  try {
    const token = req.params["token"] as string;

    if (!token) {
      return res.status(400).json({ success: false, message: "Token is required" });
    }

    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      undefined;

    const userAgent = req.headers["user-agent"] ?? undefined;

    const { signedUrl } = await redeemAccessToken(token, ipAddress, userAgent);

    return res.redirect(signedUrl);
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "Invalid or expired download token",
        "Download limit reached for this purchase",
        "Product file not found",
      ];
      if (clientErrors.includes(err.message)) {
        return res.status(403).json({ success: false, message: err.message });
      }
    }

    console.error("download error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};