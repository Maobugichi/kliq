import type { Request, Response } from "express";
import {
  getAffiliateBalance,
  requestAffiliatePayout,
  approveAffiliatePayout,
  processAffiliatePayout,
  listAffiliatePayouts,
  listAffiliatePayoutsAdmin,
} from "../services/affiliates-payout.service.js";

export const myBalance = async (req: Request, res: Response) => {
  try {
    const affiliateUserId = req.user!.id;
    const balance = await getAffiliateBalance(affiliateUserId);

    return res.status(200).json({ success: true, data: balance });
  } catch (err) {
    console.error("getAffiliateBalance error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const myPayouts = async (req: Request, res: Response) => {
  try {
    const affiliateUserId = req.user!.id;
    const payouts = await listAffiliatePayouts(affiliateUserId);

    return res.status(200).json({ success: true, count: payouts.length, data: payouts });
  } catch (err) {
    console.error("listAffiliatePayouts error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const requestPayout = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { bank_code, account_number } = req.body as {
      bank_code?: string;
      account_number?: string;
    };

    if (!bank_code || !account_number) {
      return res.status(400).json({
        success: false,
        message: "bank_code and account_number are required",
      });
    }

    const payout = await requestAffiliatePayout({ userId, bankCode: bank_code, accountNumber: account_number });

    return res.status(201).json({
      success: true,
      message: "Payout requested successfully",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = ["User not found", "You already have a payout in progress"];
      if (clientErrors.includes(err.message) || err.message.startsWith("Minimum payout is")) {
        return res.status(400).json({ success: false, message: err.message });
      }
    }
    console.error("requestAffiliatePayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const approvePayout = async (req: Request, res: Response) => {
  try {
    const adminId = req.user!.id;
    const payoutId = req.params["payoutId"] as string;

    if (!payoutId) {
      return res.status(400).json({ success: false, message: "payoutId is required" });
    }

    const payout = await approveAffiliatePayout(payoutId, adminId);

    return res.status(200).json({
      success: true,
      message: "Payout approved",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Unauthorized: admin access required") {
        return res.status(403).json({ success: false, message: err.message });
      }
      if (err.message === "Payout not found or not in pending status") {
        return res.status(404).json({ success: false, message: err.message });
      }
    }
    console.error("approveAffiliatePayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const processPayout = async (req: Request, res: Response) => {
  try {
    const adminId = req.user!.id;
    const payoutId = req.params["payoutId"] as string;

    if (!payoutId) {
      return res.status(400).json({ success: false, message: "payoutId is required" });
    }

    const payout = await processAffiliatePayout(payoutId, adminId);

    return res.status(200).json({
      success: true,
      message: "Payout processed",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Payout not found or not in approved status") {
        return res.status(404).json({ success: false, message: err.message });
      }
      if (err.message === "Payout is missing bank details") {
        return res.status(400).json({ success: false, message: err.message });
      }
    }
    console.error("processAffiliatePayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const adminListPayouts = async (req: Request, res: Response) => {
  try {
    const status = req.query["status"] as
      | "pending" | "approved" | "processing" | "paid" | "failed" | "reversed"
      | undefined;

    const payouts = await listAffiliatePayoutsAdmin(status);

    return res.status(200).json({ success: true, count: payouts.length, data: payouts });
  } catch (err) {
    console.error("listAffiliatePayoutsAdmin error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};