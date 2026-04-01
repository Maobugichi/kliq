import type { Request, Response } from "express";
import {
  createAffiliate,
  listAffiliates,
  getAffiliateStats,
  toggleAffiliate,
} from "../services/affiliate.service.js";


export const invite = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const { affiliate_user_id, commission_percent } = req.body as {
      affiliate_user_id?: string;
      commission_percent?: number;
    };

    if (!affiliate_user_id) {
      return res.status(400).json({
        success: false,
        message: "affiliate_user_id is required",
      });
    }

    const affiliate = await createAffiliate(
      creatorId,
      affiliate_user_id,
      commission_percent ?? 10
    );

    return res.status(201).json({
      success: true,
      message: "Affiliate created successfully",
      data: affiliate,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "You cannot be your own affiliate",
        "Commission must be between 1% and 90%",
        "Affiliate user not found",
      ];
      if (clientErrors.includes(err.message))
        return res.status(400).json({ success: false, message: err.message });

      if (err.message.includes("unique") || err.message.includes("duplicate"))
        return res.status(409).json({ success: false, message: "This user is already your affiliate" });
    }
    console.error("createAffiliate error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const list = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const affiliates = await listAffiliates(creatorId);

    return res.status(200).json({
      success: true,
      count: affiliates.length,
      data: affiliates,
    });
  } catch (err) {
    console.error("listAffiliates error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const myStats = async (req: Request, res: Response) => {
  try {
    const affiliateUserId = req.user!.id;
    const stats = await getAffiliateStats(affiliateUserId);

    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    console.error("getAffiliateStats error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const toggle = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const affiliateId = req.params["affiliateId"] as string;

    if (!affiliateId) {
      return res.status(400).json({ success: false, message: "affiliateId is required" });
    }

    const affiliate = await toggleAffiliate(affiliateId, creatorId);

    return res.status(200).json({
      success: true,
      message: `Affiliate ${affiliate.active ? "activated" : "deactivated"}`,
      data: affiliate,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Affiliate not found or unauthorized")
      return res.status(404).json({ success: false, message: err.message });
    console.error("toggleAffiliate error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};