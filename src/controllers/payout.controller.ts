import type { Request, Response } from "express";
import {
  requestPayout,
  approvePayout,
  processPayout,
  getCreatorPayouts,
  getCreatorBalance,
  getAllPayouts,
  getBankList,
  resolveBankAccount,
  getPayoutEvents,
} from "../services/payout.service.js";

// ─── Creator endpoints ────────────────────────────────────────────────────────

export const listBanks = async (_req: Request, res: Response) => {
  try {
    const banks = await getBankList();
    return res.status(200).json({ success: true, data: banks });
  } catch (err) {
    console.error("listBanks error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const resolveAccount = async (req: Request, res: Response) => {
  try {
    const { account_number, bank_code } = req.query as {
      account_number?: string;
      bank_code?: string;
    };

    if (!account_number || !bank_code) {
      return res.status(400).json({
        success: false,
        message: "account_number and bank_code are required",
      });
    }

    const resolved = await resolveBankAccount(account_number, bank_code);
    return res.status(200).json({ success: true, data: resolved });
  } catch (err) {
    if (err instanceof Error)
      return res.status(400).json({ success: false, message: err.message });
    console.error("resolveAccount error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getBalance = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const balance = await getCreatorBalance(userId);
    return res.status(200).json({ success: true, data: balance });
  } catch (err) {
    console.error("getBalance error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const myPayouts = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const payouts = await getCreatorPayouts(creatorId);
    return res.status(200).json({ success: true, data: payouts });
  } catch (err) {
    console.error("myPayouts error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const requestPayoutController = async (req: Request, res: Response) => {
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

    const payout = await requestPayout({
      userId,
      bankCode: bank_code,
      accountNumber: account_number,
    });

    return res.status(201).json({
      success: true,
      message: "Payout request submitted — pending admin approval",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "You already have a payout in progress",
        "Insufficient balance for payout",
        "Creator profile not found",
      ];
      // Minimum payout error message is dynamic so check with startsWith
      if (
        clientErrors.includes(err.message) ||
        err.message.startsWith("Minimum payout is")
      ) {
        return res.status(400).json({ success: false, message: err.message });
      }
    }
    console.error("requestPayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ─── Admin endpoints ──────────────────────────────────────────────────────────

export const listAllPayouts = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const payouts = await getAllPayouts(status as string | undefined);
    return res.status(200).json({ success: true, count: payouts.length, data: payouts });
  } catch (err) {
    console.error("listAllPayouts error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /admin/payouts/:payoutId/approve
export const approvePayoutController = async (req: Request, res: Response) => {
  try {
    const adminId  = req.user!.id;
    const payoutId = req.params["payoutId"] as string;

    if (!payoutId) {
      return res.status(400).json({ success: false, message: "payoutId is required" });
    }

    const payout = await approvePayout(payoutId, adminId);

    return res.status(200).json({
      success: true,
      message: "Payout approved",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Unauthorized: admin access required")
        return res.status(403).json({ success: false, message: err.message });
      if (err.message === "Payout not found or not in pending status")
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error("approvePayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /admin/payouts/:payoutId/process
export const processPayoutController = async (req: Request, res: Response) => {
  try {
    const adminId  = req.user!.id;
    const payoutId = req.params["payoutId"] as string;

    if (!payoutId) {
      return res.status(400).json({ success: false, message: "payoutId is required" });
    }

    const payout = await processPayout(payoutId, adminId);

    return res.status(200).json({
      success: true,
      message: "Payout processed — transfer initiated",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "Payout not found or not in approved status",
        "Payout is missing bank details",
      ];
      if (clientErrors.includes(err.message))
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error("processPayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /admin/payouts/:payoutId/events — audit trail for a specific payout
export const listPayoutEvents = async (req: Request, res: Response) => {
  try {
    const payoutId = req.params["payoutId"] as string;

    if (!payoutId) {
      return res.status(400).json({ success: false, message: "payoutId is required" });
    }

    const events = await getPayoutEvents(payoutId);
    return res.status(200).json({ success: true, data: events });
  } catch (err) {
    console.error("listPayoutEvents error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};