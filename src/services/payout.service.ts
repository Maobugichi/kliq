import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { getPlatformFee } from "./config.service.js";
import {
  paystackRequest,
  resolveBankAccount,
  getBankList,
  ensurePaystackRecipient,
  sendPaystackTransfer,
} from "./paystack-transfer.service.js";


export { resolveBankAccount, getBankList };

const MINIMUM_PAYOUT_CENTS = 500_000; // ₦5,000

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Payout {
  id: string;
  creator_id: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "approved" | "processing" | "paid" | "failed" | "reversed";
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  paystack_transfer_code: string | null;
  idempotency_key: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  failure_reason: string | null;
  requested_at: Date;
  processed_at: Date | null;
  notes: string | null;
}

export interface PayoutEvent {
  id: string;
  payout_id: string;
  event: string;
  note: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

interface RequestPayoutInput {
  userId: string;
  bankCode: string;
  accountNumber: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const feeToBasisPoints = (fee: number): number => Math.round(fee * 10_000);
const applyFee = (amountCents: number, feeBasisPoints: number): number =>
  Math.floor((amountCents * (10_000 - feeBasisPoints)) / 10_000);

const recordPayoutEvent = async (
  client: PoolClient,
  payoutId: string,
  event: string,
  note?: string,
  actorId?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  await client.query(
    `INSERT INTO payout_events (payout_id, event, note, actor_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [payoutId, event, note ?? null, actorId ?? null, metadata ?? null]
  );
};


const calculateCreatorBalance = async (
  executor: Pool | PoolClient,
  creatorProfileId: string,
  feeBasisPoints: number
): Promise<{ total_earned: number; total_paid_out: number; available: number }> => {
  const [earnedResult, reservedResult] = await Promise.all([
    executor.query<{ total: string }>(
      `SELECT COALESCE(SUM(o.amount_cents - COALESCE(ac.commission_cents, 0)), 0) AS total
       FROM orders o
       JOIN products pr ON o.product_id = pr.id
       LEFT JOIN affiliate_conversions ac ON ac.order_id = o.id
       WHERE pr.creator_id = $1 AND o.status = 'paid'`,
      [creatorProfileId]
    ),
    executor.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM payouts
       WHERE creator_id = $1
         AND status IN ('pending', 'approved', 'processing', 'paid')`,
      [creatorProfileId]
    ),
  ]);

  const totalEarned = parseInt(earnedResult.rows[0]?.total ?? "0", 10);
  const totalReserved = parseInt(reservedResult.rows[0]?.total ?? "0", 10);
  const netEarned = applyFee(totalEarned, feeBasisPoints);
  const available = Math.max(0, netEarned - totalReserved);

  return {
    total_earned: totalEarned,
    total_paid_out: totalReserved,
    available,
  };
};

// ─── Bank helpers ─────────────────────────────────────────────────────────────
// resolveBankAccount, getBankList, and ensurePaystackRecipient now live in
// paystack-transfer.service.ts, shared with the affiliate payout flow.
// This file's ensurePaystackRecipient calls below pass creator_profiles-specific
// get/save closures into the generalized shared function.

// ─── Creator requests payout ──────────────────────────────────────────────────

export const requestPayout = async ({
  userId,
  bankCode,
  accountNumber,
}: RequestPayoutInput): Promise<Payout> => {
  const [resolved, platformFee] = await Promise.all([
    resolveBankAccount(accountNumber, bankCode),
    getPlatformFee(),
  ]);

  const feeBasisPoints = feeToBasisPoints(platformFee);

  const { rows:[creatorProfile] } = await pool.query(`SELECT id FROM creator_profiles WHERE user_id = $1`,
    [userId]
  )

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [profile] } = await client.query<{ id: string }>(
      `SELECT id FROM creator_profiles WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!profile) {
      await client.query("ROLLBACK");
      throw new Error("Creator profile not found");
    }

    const { rows: [activePayout] } = await client.query<{ id: string }>(
      `SELECT id FROM payouts
       WHERE creator_id = $1 AND status IN ('pending', 'processing', 'approved')`,
      [creatorProfile.id]
    );

    if (activePayout) {
      await client.query("ROLLBACK");
      throw new Error("You already have a payout in progress");
    }

    // Single shared balance calculation — run on this transaction's locked
    // client, so it reflects the same lock on creator_profiles acquired above
    const balance = await calculateCreatorBalance(client, creatorProfile.id, feeBasisPoints);
    const payoutAmount = balance.available;

    if (payoutAmount < MINIMUM_PAYOUT_CENTS) {
      await client.query("ROLLBACK");
      throw new Error(
        `Minimum payout is ₦${(MINIMUM_PAYOUT_CENTS / 100).toLocaleString('en-US')}. ` +
        `Your available balance is ₦${(payoutAmount / 100).toLocaleString('en-US')}.`
      );
    }

    const idempotencyKey = `payout-${creatorProfile.id}-${Date.now()}`;

    const { rows: [payout] } = await client.query<Payout>(
      `INSERT INTO payouts
         (creator_id, amount_cents, currency, bank_code, account_number,
          account_name, status, idempotency_key)
       VALUES ($1, $2, 'NGN', $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [
       creatorProfile.id,
        payoutAmount,
        bankCode,
        resolved.account_number,
        resolved.account_name,
        idempotencyKey,
      ]
    );

    if (!payout) throw new Error("Failed to create payout request");

    await recordPayoutEvent(client, payout.id, "requested", undefined, userId);

    await client.query("COMMIT");
    return payout;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ─── Admin approves payout ────────────────────────────────────────────────────

export const approvePayout = async (
  payoutId: string,
  adminId: string
): Promise<Payout> => {
  const { rows: [actor] } = await pool.query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [adminId]
  );

  if (!actor || actor.role !== "admin") {
    throw new Error("Unauthorized: admin access required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [payout] } = await client.query<Payout>(
      `SELECT * FROM payouts WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [payoutId]
    );

    if (!payout) {
      await client.query("ROLLBACK");
      throw new Error("Payout not found or not in pending status");
    }

    const { rows: [updated] } = await client.query<Payout>(
      `UPDATE payouts
       SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adminId, payoutId]
    );

    await recordPayoutEvent(client, payoutId, "approved", undefined, adminId);

    if (!updated) throw new Error("Failed to approve payout");

    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ─── Admin processes payout ───────────────────────────────────────────────────

export const processPayout = async (payoutId: string, adminId: string): Promise<Payout> => {
  let payout: Payout;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [lockedPayout] } = await client.query<Payout>(
      `SELECT p.*, cp.id AS profile_id
       FROM payouts p
       JOIN creator_profiles cp ON cp.user_id = p.creator_id
       WHERE p.id = $1 AND p.status = 'approved'
       FOR UPDATE OF p`,
      [payoutId]
    );

    if (!lockedPayout) {
      await client.query("ROLLBACK");
      throw new Error("Payout not found or not in approved status");
    }

    if (!lockedPayout.account_number || !lockedPayout.bank_code) {
      await client.query("ROLLBACK");
      throw new Error("Payout is missing bank details");
    }

    await client.query(
      `UPDATE payouts SET status = 'processing', processed_at = NOW() WHERE id = $1`,
      [payoutId]
    );

    await recordPayoutEvent(client, payoutId, "processing", undefined, adminId);

    await client.query("COMMIT");
    payout = lockedPayout;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  try {
    const creatorProfileId = (payout as any).profile_id;

    const recipientCode = await ensurePaystackRecipient(
      async () => {
        const { rows: [profile] } = await pool.query<{ paystack_recipient_code: string | null }>(
          `SELECT paystack_recipient_code FROM creator_profiles WHERE id = $1`,
          [creatorProfileId]
        );
        return profile?.paystack_recipient_code ?? null;
      },
      async (code: string) => {
        await pool.query(
          `UPDATE creator_profiles SET paystack_recipient_code = $1 WHERE id = $2`,
          [code, creatorProfileId]
        );
      },
      payout.account_name!,
      payout.account_number!,
      payout.bank_code!
    );

    const transferResult = await sendPaystackTransfer(
      payout.amount_cents,
      recipientCode,
      `CreatorLock payout — ${payoutId}`,
      payout.idempotency_key ?? payoutId
    );

    const { rows: [updated] } = await pool.query<Payout>(
      `UPDATE payouts
       SET paystack_transfer_code = $1
       WHERE id = $2
       RETURNING *`,
      [transferResult.transfer_code, payoutId]
    );

    if (!updated) throw new Error("Failed to store transfer code");
    return updated;
  } catch (err) {
    await pool.query(
      `UPDATE payouts SET failure_reason = $1 WHERE id = $2`,
      [(err as Error).message, payoutId]
    );
    throw err;
  }
};

// ─── Webhook handler (driven by Paystack transfer webhooks) ───────────────────

export const handlePayoutWebhook = async (
  event: string,
  data: Record<string, any>
): Promise<void> => {
  const transferCode = data.transfer_code as string;
  const reason       = data.reason as string | undefined;

  if (!transferCode) return;

  const { rows: [payout] } = await pool.query<Payout>(
    `SELECT * FROM payouts WHERE paystack_transfer_code = $1`,
    [transferCode]
  );

  if (!payout) {
    console.warn(`[payoutWebhook] No payout found for transfer code ${transferCode}`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [locked] } = await client.query<Payout>(
      `SELECT * FROM payouts WHERE id = $1 FOR UPDATE`,
      [payout.id]
    );

    if (!locked) {
      await client.query("ROLLBACK");
      return;
    }

    if (["paid", "failed", "reversed"].includes(locked.status)) {
      await client.query("ROLLBACK");
      return;
    }

    let newStatus: Payout["status"];
    let eventName: string;

    switch (event) {
      case "transfer.success":
        newStatus = "paid";
        eventName = "paid";
        break;
      case "transfer.failed":
        newStatus = "failed";
        eventName = "failed";
        break;
      case "transfer.reversed":
        newStatus = "reversed";
        eventName = "reversed";
        break;
      default:
        await client.query("ROLLBACK");
        return;
    }

    await client.query(
      `UPDATE payouts
       SET status = $1,
           failure_reason = $2,
           processed_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE processed_at END
       WHERE id = $3`,
      [newStatus, newStatus === "failed" || newStatus === "reversed" ? (reason ?? null) : null, payout.id]
    );

    await recordPayoutEvent(
      client,
      payout.id,
      eventName,
      reason,
      undefined,
      { transfer_code: transferCode }
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ─── Reconciliation (called by the reconciliation worker) ─────────────────────

export const reconcileStalePayouts = async (): Promise<void> => {
  const { rows: stale } = await pool.query<Payout>(
    `SELECT * FROM payouts
     WHERE status = 'processing'
       AND processed_at < NOW() - INTERVAL '30 minutes'`,
  );

  for (const payout of stale) {
    if (!payout.paystack_transfer_code) {
      await pool.query(
        `UPDATE payouts
         SET status = 'approved', failure_reason = 'Recovered: transfer never initiated'
         WHERE id = $1 AND status = 'processing'`,
        [payout.id]
      );

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await recordPayoutEvent(
          client,
          payout.id,
          "recovered",
          "Transfer never initiated — reverted to approved for retry"
        );
        await client.query("COMMIT");
      } finally {
        client.release();
      }

      continue;
    }

    try {
      const data = await paystackRequest(
        "GET",
        `/transfer/${payout.paystack_transfer_code}`
      );

      const transferStatus = data.data.status as string;

      if (transferStatus === "success") {
        await handlePayoutWebhook("transfer.success", data.data);
      } else if (transferStatus === "failed") {
        await handlePayoutWebhook("transfer.failed", data.data);
      } else if (transferStatus === "reversed") {
        await handlePayoutWebhook("transfer.reversed", data.data);
      }
    } catch (err) {
      console.error(`[reconcile] Failed to verify transfer ${payout.paystack_transfer_code}:`, err);
    }
  }
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getCreatorPayouts = async (userId: string): Promise<Payout[]> => {

  const { rows: [profile] } = await pool.query<{ id: string }>(
    `SELECT id FROM creator_profiles WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );

  if (!profile) {
    throw new Error('creator profile not found');
  }

  const { rows } = await pool.query<Payout>(
    `SELECT * FROM payouts WHERE creator_id = $1 ORDER BY requested_at DESC`,
    [profile.id]
  );
  return rows;
};

export const getPayoutEvents = async (payoutId: string): Promise<PayoutEvent[]> => {
  const { rows } = await pool.query<PayoutEvent>(
    `SELECT * FROM payout_events WHERE payout_id = $1 ORDER BY created_at ASC`,
    [payoutId]
  );
  return rows;
};

export const getCreatorBalance = async (
  userId: string
): Promise<{ total_earned: number; total_paid_out: number; available: number }> => {
  const { rows: [profile] } = await pool.query<{ id: string }>(
    `SELECT id FROM creator_profiles WHERE user_id = $1`,
    [userId]
  );

  if (!profile) {
    throw new Error('Creator profile not found');
  }

  const platformFee = await getPlatformFee();
  const feeBasisPoints = feeToBasisPoints(platformFee);

  return calculateCreatorBalance(pool, profile.id, feeBasisPoints);
};

export const getAllPayouts = async (status?: string): Promise<Payout[]> => {
  const { rows } = await pool.query<Payout>(
    status
      ? `SELECT * FROM payouts WHERE status = $1 ORDER BY requested_at DESC`
      : `SELECT * FROM payouts ORDER BY requested_at DESC`,
    status ? [status] : []
  );
  return rows;
};