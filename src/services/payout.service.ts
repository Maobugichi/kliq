import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { getPlatformFee } from "./config.service.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE   = "https://api.paystack.co";

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

const paystackRequest = async (
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string
) => {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message ?? "Paystack request failed");
  return data;
};


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

// ─── Bank helpers ─────────────────────────────────────────────────────────────

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

export const getBankList = async (): Promise<{ name: string; code: string }[]> => {
  const data = await paystackRequest("GET", "/bank?currency=NGN&country=nigeria");
  return data.data.map((b: any) => ({ name: b.name, code: b.code }));
};

const ensurePaystackRecipient = async (
  creatorProfileId: string,
  accountName: string,
  accountNumber: string,
  bankCode: string
): Promise<string> => {
  const { rows: [profile] } = await pool.query<{ paystack_recipient_code: string | null }>(
    `SELECT paystack_recipient_code FROM creator_profiles WHERE id = $1`,
    [creatorProfileId]
  );

  if (profile?.paystack_recipient_code) {
    return profile.paystack_recipient_code;
  }

  const data = await paystackRequest("POST", "/transferrecipient", {
    type: "nuban",
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: "NGN",
  });

  const recipientCode = data.data.recipient_code as string;

  await pool.query(
    `UPDATE creator_profiles SET paystack_recipient_code = $1 WHERE id = $2`,
    [recipientCode, creatorProfileId]
  );

  return recipientCode;
};

// ─── Creator requests payout ──────────────────────────────────────────────────

export const requestPayout = async ({
  userId,
  bankCode,
  accountNumber,
}: RequestPayoutInput): Promise<Payout> => {
  // Resolve bank account and platform fee before acquiring lock
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

    // Lock the creator_profiles row — always exists, prevents concurrent payout requests
    // even when creator has no prior payouts
    const { rows: [profile] } = await client.query<{ id: string }>(
      `SELECT id FROM creator_profiles WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!profile) {
      await client.query("ROLLBACK");
      throw new Error("Creator profile not found");
    }

    // Block if any in-flight payout exists
    const { rows: [activePayout] } = await client.query<{ id: string }>(
      `SELECT id FROM payouts
       WHERE creator_id = $1 AND status IN ('pending', 'processing', 'approved')`,
      [creatorProfile.id]
    );

    if (activePayout) {
      await client.query("ROLLBACK");
      throw new Error("You already have a payout in progress");
    }

    // Balance = paid orders minus all non-failed/reversed payouts
    const { rows: [balanceRow] } = await client.query<{ balance: string }>(
      `SELECT
         COALESCE((
           SELECT SUM(o.amount_cents)
           FROM orders o
           JOIN products pr ON o.product_id = pr.id
           WHERE pr.creator_id = $1 AND o.status = 'paid'
         ), 0) -
         COALESCE((
           SELECT SUM(p.amount_cents)
           FROM payouts p
           WHERE p.creator_id = $1
             AND p.status IN ('pending', 'approved', 'processing', 'paid')
         ), 0) AS balance`,
      [creatorProfile.id]
    );

    const grossBalance  = parseInt(balanceRow?.balance ?? "0", 10);
    const payoutAmount  = applyFee(grossBalance, feeBasisPoints);

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
  // Verify the actor is actually an admin
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

  // Lock and mark as processing before any Paystack calls —
  // prevents double-send if endpoint is retried concurrently
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

  // Paystack calls outside the transaction — failure leaves status as 'processing'
  // which the reconciliation worker will recover
  try {
    const recipientCode = await ensurePaystackRecipient(
      (payout as any).profile_id,
      payout.account_name!,
      payout.account_number!,
      payout.bank_code!
    );

    // Idempotency key prevents duplicate transfers on retry
    const transferData = await paystackRequest(
      "POST",
      "/transfer",
      {
        source: "balance",
        amount: payout.amount_cents,
        recipient: recipientCode,
        reason: `CreatorLock payout — ${payoutId}`,
      },
      payout.idempotency_key ?? payoutId
    );

    const { rows: [updated] } = await pool.query<Payout>(
      `UPDATE payouts
       SET paystack_transfer_code = $1
       WHERE id = $2
       RETURNING *`,
      [transferData.data.transfer_code, payoutId]
    );

    if (!updated) throw new Error("Failed to store transfer code");
    return updated;
  } catch (err) {
    // Log the failure but don't revert to pending — reconciliation worker handles recovery
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

    // Re-fetch with lock
    const { rows: [locked] } = await client.query<Payout>(
      `SELECT * FROM payouts WHERE id = $1 FOR UPDATE`,
      [payout.id]
    );

    if (!locked) {
      await client.query("ROLLBACK");
      return;
    }

    // Ignore if already in a terminal state
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
  // Find payouts stuck in processing for more than 30 minutes
  const { rows: stale } = await pool.query<Payout>(
    `SELECT * FROM payouts
     WHERE status = 'processing'
       AND processed_at < NOW() - INTERVAL '30 minutes'`,
  );

  for (const payout of stale) {
    if (!payout.paystack_transfer_code) {
      // Transfer was never created — safe to revert to approved for retry
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

    // Transfer was created — verify its current status with Paystack
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
      // otp/pending/processing — still in flight, leave it
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


  const { rows:[creatorId] } = await pool.query(
    `SELECT id FROM creator_profiles WHERE user_id = $1`,
    [userId]
  )

  const [earnedResult, reservedResult, platformFee] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(o.amount_cents), 0) AS total
       FROM orders o
       JOIN products pr ON o.product_id = pr.id
       WHERE pr.creator_id = $1 AND o.status = 'paid'`,
      [creatorId.id]
    ),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM payouts
       WHERE creator_id = $1
         AND status IN ('pending', 'approved', 'processing', 'paid')`,
      [creatorId.id]
    ),
    getPlatformFee(),
  ]);

  const totalEarned   = parseInt(earnedResult.rows[0]?.total   ?? "0", 10);
  const totalReserved = parseInt(reservedResult.rows[0]?.total ?? "0", 10);
  const feeBasisPoints = feeToBasisPoints(platformFee);

  const netEarned  = applyFee(totalEarned, feeBasisPoints);
  const available  = Math.max(0, netEarned - totalReserved);

  console.log("totalEarned:", totalEarned);
console.log("totalReserved:", totalReserved);
console.log("feeBasisPoints:", feeBasisPoints);
console.log("netEarned:", netEarned);
console.log("available:", available);

  return {
    total_earned:   totalEarned,
    total_paid_out: totalReserved,
    available,
  };
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