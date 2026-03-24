import pool from "../config/db.js";
import { getPlatformFee } from "./config.service.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE = "https://api.paystack.co";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Payout {
  id: string;
  creator_id: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "approved" | "processing" | "paid" | "failed";
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  paystack_transfer_code: string | null;
  requested_at: Date;
  processed_at: Date | null;
  notes: string | null;
}

interface RequestPayoutInput {
  creatorId: string;
  bankCode: string;
  accountNumber: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const paystackRequest = async (
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
) => {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message ?? "Paystack request failed");
  return data;
};

// ─── Resolve bank account ─────────────────────────────────────────────────────

// Verify account number + bank code before creating a payout request
export const resolveBankAccount = async (
  accountNumber: string,
  bankCode: string
): Promise<{ account_name: string; account_number: string }> => {
  const data = await paystackRequest(
    "GET",
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
  );

  return {
    account_name: data.data.account_name,
    account_number: data.data.account_number,
  };
};

// Get list of Nigerian banks from Paystack
export const getBankList = async (): Promise<
  { name: string; code: string }[]
> => {
  const data = await paystackRequest("GET", "/bank?currency=NGN&country=nigeria");
  return data.data.map((b: any) => ({ name: b.name, code: b.code }));
};

// ─── Creator requests payout ──────────────────────────────────────────────────

export const requestPayout = async ({
  creatorId,
  bankCode,
  accountNumber,
}: RequestPayoutInput): Promise<Payout> => {
  // Calculate available balance — sum of paid orders minus previous paid payouts
  const { rows: [balanceRow] } = await pool.query<{ balance: string }>(
    `SELECT
       COALESCE(SUM(o.amount_cents), 0) -
       COALESCE((
         SELECT SUM(p.amount_cents)
         FROM payouts p
         WHERE p.creator_id = $1 AND p.status = 'paid'
       ), 0) AS balance
     FROM orders o
     JOIN products pr ON o.product_id = pr.id
     WHERE pr.creator_id = $1 AND o.status = 'paid'`,
    [creatorId]
  );

  const availableBalance = parseInt(balanceRow?.balance ?? "0", 10);

  const platformFee = await getPlatformFee();
  const payoutAmount = Math.floor(availableBalance * (1 - platformFee));

  if (payoutAmount <= 0) {
    throw new Error("Insufficient balance for payout");
  }

  // Check no pending payout already exists
  const { rows: [pendingPayout] } = await pool.query<{ id: string }>(
    `SELECT id FROM payouts
     WHERE creator_id = $1 AND status = 'pending'`,
    [creatorId]
  );

  if (pendingPayout) {
    throw new Error("You already have a pending payout request");
  }

  // Verify bank account with Paystack
  const resolved = await resolveBankAccount(accountNumber, bankCode);

  // Create payout record
  const { rows: [payout] } = await pool.query<Payout>(
    `INSERT INTO payouts
       (creator_id, amount_cents, bank_code, account_number, account_name, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [
      creatorId,
      payoutAmount,
      bankCode,
      resolved.account_number,
      resolved.account_name,
    ]
  );

  if (!payout) throw new Error("Failed to create payout request");
  return payout;
};

// ─── Admin processes payout ───────────────────────────────────────────────────

export const processPayout = async (payoutId: string): Promise<Payout> => {
  const { rows: [payout] } = await pool.query<Payout>(
    `SELECT * FROM payouts WHERE id = $1 AND status = 'pending'`,
    [payoutId]
  );

  if (!payout) throw new Error("Payout not found or not in pending status");
  if (!payout.account_number || !payout.bank_code) {
    throw new Error("Payout is missing bank details");
  }

  // Create Paystack transfer recipient
  const recipientData = await paystackRequest("POST", "/transferrecipient", {
    type: "nuban",
    name: payout.account_name,
    account_number: payout.account_number,
    bank_code: payout.bank_code,
    currency: "NGN",
  });

  const recipientCode = recipientData.data.recipient_code;

  // Initiate transfer
  const transferData = await paystackRequest("POST", "/transfer", {
    source: "balance",
    amount: payout.amount_cents,
    recipient: recipientCode,
    reason: `CreatorLock payout — ${payoutId}`,
  });

  const transferCode = transferData.data.transfer_code;

  // Update payout record
  const { rows: [updated] } = await pool.query<Payout>(
    `UPDATE payouts
     SET status = 'processing',
         paystack_transfer_code = $1,
         processed_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [transferCode, payoutId]
  );

  if (!updated) throw new Error("Failed to update payout record");
  return updated;
};

// ─── Get payouts ──────────────────────────────────────────────────────────────

export const getCreatorPayouts = async (creatorId: string): Promise<Payout[]> => {
  const { rows } = await pool.query<Payout>(
    `SELECT * FROM payouts WHERE creator_id = $1 ORDER BY requested_at DESC`,
    [creatorId]
  );
  return rows;
};

export const getCreatorBalance = async (
  creatorId: string
): Promise<{ total_earned: number; total_paid_out: number; available: number }> => {
  const { rows: [earned] } = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(o.amount_cents), 0) AS total
     FROM orders o
     JOIN products pr ON o.product_id = pr.id
     WHERE pr.creator_id = $1 AND o.status = 'paid'`,
    [creatorId]
  );

  const { rows: [paidOut] } = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total
     FROM payouts
     WHERE creator_id = $1 AND status = 'paid'`,
    [creatorId]
  );

  const totalEarned = parseInt(earned?.total ?? "0", 10);
  const totalPaidOut = parseInt(paidOut?.total ?? "0", 10);
  const platformFee = await getPlatformFee();
  const available = Math.floor((totalEarned - totalPaidOut) * (1 - platformFee));

  return {
    total_earned: totalEarned,
    total_paid_out: totalPaidOut,
    available,
  };
};

// ─── All payouts (admin) ──────────────────────────────────────────────────────

export const getAllPayouts = async (status?: string): Promise<Payout[]> => {
  const { rows } = await pool.query<Payout>(
    status
      ? `SELECT * FROM payouts WHERE status = $1 ORDER BY requested_at DESC`
      : `SELECT * FROM payouts ORDER BY requested_at DESC`,
    status ? [status] : []
  );
  return rows;
};