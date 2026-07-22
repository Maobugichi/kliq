import type { Request, Response } from "express";
import {
  createAffiliate,
  listAffiliates,
  getAffiliateStats,
  toggleAffiliate,
  resendAffiliateInvite,
  updateAffiliateCommission,
  deleteAffiliate,
} from "../services/affiliate.service.js";


export const invite = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const { affiliate_email, commission_percent } = req.body as {
      affiliate_email?: string;    
      commission_percent?: number;
    };

    if (!affiliate_email) {
      return res.status(400).json({
        success: false,
        message: "affiliate_email is required",   
      });
    }

    const affiliate = await createAffiliate(
      creatorId,
      affiliate_email,             
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



export const resendInvite = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const affiliateId = req.params["affiliateId"] as string;

    if (!affiliateId) {
      return res.status(400).json({ success: false, message: "affiliateId is required" });
    }

    const affiliate = await resendAffiliateInvite(affiliateId, creatorId);

    return res.status(200).json({
      success: true,
      message: "Invite resent successfully",
      data: affiliate,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Affiliate not found or unauthorized") {
        return res.status(404).json({ success: false, message: err.message });
      }
      if (err.message.startsWith("Please wait")) {
        return res.status(429).json({ success: false, message: err.message });
      }
    }
    console.error("resendAffiliateInvite error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const updateCommission = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const affiliateId = req.params["affiliateId"] as string;
    const { commission_percent } = req.body as { commission_percent?: number };
 
    if (!affiliateId) {
      return res.status(400).json({ success: false, message: "affiliateId is required" });
    }
 
    if (commission_percent === undefined || commission_percent === null) {
      return res.status(400).json({ success: false, message: "commission_percent is required" });
    }
 
    const affiliate = await updateAffiliateCommission(affiliateId, creatorId, commission_percent);
 
    return res.status(200).json({
      success: true,
      message: "Commission updated successfully",
      data: affiliate,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Commission must be between 1% and 90%") {
        return res.status(400).json({ success: false, message: err.message });
      }
      if (err.message === "Affiliate not found or unauthorized") {
        return res.status(404).json({ success: false, message: err.message });
      }
    }
    console.error("updateAffiliateCommission error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const affiliateId = req.params["affiliateId"] as string;
 
    if (!affiliateId) {
      return res.status(400).json({ success: false, message: "affiliateId is required" });
    }
 
    await deleteAffiliate(affiliateId, creatorId);
 
    return res.status(200).json({
      success: true,
      message: "Affiliate deleted successfully",
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Affiliate not found or unauthorized") {
        return res.status(404).json({ success: false, message: err.message });
      }
      if (err.message.startsWith("Cannot delete")) {
        return res.status(409).json({ success: false, message: err.message });
      }
    }
    console.error("deleteAffiliate error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};