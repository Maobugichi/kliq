import type { Request, Response } from "express";
import {
  requestPayout,
  processPayout,
  getCreatorPayouts,
  getCreatorBalance,
  getAllPayouts,
  getBankList,
  resolveBankAccount,
} from "../services/payout.service.js";

// ─── Creator endpoints ────────────────────────────────────────────────────────

// GET /payouts/banks — list Nigerian banks for the frontend dropdown
export const listBanks = async (_req: Request, res: Response) => {
  try {
    const banks = await getBankList();
    return res.status(200).json({ success: true, data: banks });
  } catch (err) {
    console.error("listBanks error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /payouts/resolve?account_number=&bank_code=
// Verify a bank account before submitting payout request
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

// GET /payouts/balance — creator's available balance
export const getBalance = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const balance = await getCreatorBalance(creatorId);
    return res.status(200).json({ success: true, data: balance });
  } catch (err) {
    console.error("getBalance error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /payouts/me — creator's payout history
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

// POST /payouts/request — creator requests a withdrawal
export const requestPayoutController = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
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

    const payout = await requestPayout({ creatorId, bankCode: bank_code, accountNumber: account_number });

    return res.status(201).json({
      success: true,
      message: "Payout request submitted — pending admin approval",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "Insufficient balance for payout",
        "You already have a pending payout request",
      ];
      if (clientErrors.includes(err.message))
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error("requestPayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ─── Admin endpoints ──────────────────────────────────────────────────────────

// GET /admin/payouts?status=pending
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

// POST /admin/payouts/:payoutId/process — admin triggers the Paystack transfer
export const processPayoutController = async (req: Request, res: Response) => {
  try {
    const { payoutId } = req.params;

    if (!payoutId) {
      return res.status(400).json({ success: false, message: "payoutId is required" });
    }

    const payout = await processPayout(payoutId);

    return res.status(200).json({
      success: true,
      message: "Payout processed — transfer initiated",
      data: payout,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "Payout not found or not in pending status",
        "Payout is missing bank details",
      ];
      if (clientErrors.includes(err.message))
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error("processPayout error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};