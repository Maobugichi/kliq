import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { resolveBankAccount, ensurePaystackRecipient, sendPaystackTransfer } from "./paystack-transfer.service.js";

const MINIMUM_PAYOUT_CENTS = 500_000; // ₦5,000 — same threshold as creator payouts

export interface AffiliatePayout {
  id: string;
  affiliate_user_id: string;
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
  requested_at: Date | null;
  processed_at: Date | null;
  notes: string | null;
}

interface RequestAffiliatePayoutInput {
  userId: string;
  bankCode: string;
  accountNumber: string;
}

const recordAffiliatePayoutEvent = async (
  client: PoolClient,
  affiliatePayoutId: string,
  event: string,
  note?: string,
  actorId?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  await client.query(
    `INSERT INTO affiliate_payout_events (affiliate_payout_id, event, note, actor_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [affiliatePayoutId, event, note ?? null, actorId ?? null, metadata ?? null]
  );
};

// ─── Balance (single source of truth for affiliates, same shape as
// calculateCreatorBalance in payout.service.ts) ─────────────────────────────
// Computed live from affiliate_conversions / affiliate_payouts rather than
// the affiliate_conversions.paid_out flag — nothing in the codebase currently
// writes that flag, so trusting it would silently reintroduce the same
// stored-value-drift problem we already removed for creators.
export const calculateAffiliateBalance = async (
  executor: Pool | PoolClient,
  affiliateUserId: string
): Promise<{ total_earned: number; total_paid_out: number; available: number }> => {
  const [earnedResult, reservedResult] = await Promise.all([
    executor.query<{ total: string }>(
      `SELECT COALESCE(SUM(ac.commission_cents), 0) AS total
       FROM affiliate_conversions ac
       JOIN affiliates a ON ac.affiliate_id = a.id
       WHERE a.affiliate_user_id = $1`,
      [affiliateUserId]
    ),
    executor.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM affiliate_payouts
       WHERE affiliate_user_id = $1
         AND status IN ('pending', 'approved', 'processing', 'paid')`,
      [affiliateUserId]
    ),
  ]);

  const totalEarned = parseInt(earnedResult.rows[0]?.total ?? "0", 10);
  const totalReserved = parseInt(reservedResult.rows[0]?.total ?? "0", 10);

  // No platform fee applied here, unlike creator balance — commission is
  // already the platform's fee-adjusted slice of the original sale, taken
  // at the point the conversion was recorded. Applying a second fee here
  // would mean the same sale gets fee'd twice on its way to two different
  // people. Confirmed: affiliate withdrawals are fee-free.
  const available = Math.max(0, totalEarned - totalReserved);

  return {
    total_earned: totalEarned,
    total_paid_out: totalReserved,
    available,
  };
};

export const getAffiliateBalance = async (
  affiliateUserId: string
): Promise<{ total_earned: number; total_paid_out: number; available: number }> => {
  return calculateAffiliateBalance(pool, affiliateUserId);
};

// ─── Affiliate requests payout ─────────────────────────────────────────────────

export const requestAffiliatePayout = async ({
  userId,
  bankCode,
  accountNumber,
}: RequestAffiliatePayoutInput): Promise<AffiliatePayout> => {
  const resolved = await resolveBankAccount(accountNumber, bankCode);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the users row — mirrors requestPayout locking creator_profiles,
    // prevents two concurrent payout requests from both reading a balance
    // before either one's reservation is recorded
    const { rows: [lockedUser] } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    if (!lockedUser) {
      await client.query("ROLLBACK");
      throw new Error("User not found");
    }

    // Block if any in-flight payout exists
    const { rows: [activePayout] } = await client.query<{ id: string }>(
      `SELECT id FROM affiliate_payouts
       WHERE affiliate_user_id = $1 AND status IN ('pending', 'processing', 'approved')`,
      [userId]
    );

    if (activePayout) {
      await client.query("ROLLBACK");
      throw new Error("You already have a payout in progress");
    }

    const balance = await calculateAffiliateBalance(client, userId);
    const payoutAmount = balance.available;

    if (payoutAmount < MINIMUM_PAYOUT_CENTS) {
      await client.query("ROLLBACK");
      throw new Error(
        `Minimum payout is ₦${(MINIMUM_PAYOUT_CENTS / 100).toLocaleString('en-US')}. ` +
        `Your available balance is ₦${(payoutAmount / 100).toLocaleString('en-US')}.`
      );
    }

    const idempotencyKey = `affiliate-payout-${userId}-${Date.now()}`;

    const { rows: [payout] } = await client.query<AffiliatePayout>(
      `INSERT INTO affiliate_payouts
         (affiliate_user_id, amount_cents, currency, bank_code, account_number,
          account_name, status, idempotency_key)
       VALUES ($1, $2, 'NGN', $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [
        userId,
        payoutAmount,
        bankCode,
        resolved.account_number,
        resolved.account_name,
        idempotencyKey,
      ]
    );

    if (!payout) throw new Error("Failed to create payout request");

    await recordAffiliatePayoutEvent(client, payout.id, "requested", undefined, userId);

    await client.query("COMMIT");
    return payout;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ─── Admin approves affiliate payout ───────────────────────────────────────────

export const approveAffiliatePayout = async (
  affiliatePayoutId: string,
  adminId: string
): Promise<AffiliatePayout> => {
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

    const { rows: [payout] } = await client.query<AffiliatePayout>(
      `SELECT * FROM affiliate_payouts WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [affiliatePayoutId]
    );

    if (!payout) {
      await client.query("ROLLBACK");
      throw new Error("Payout not found or not in pending status");
    }

    const { rows: [updated] } = await client.query<AffiliatePayout>(
      `UPDATE affiliate_payouts
       SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adminId, affiliatePayoutId]
    );

    await recordAffiliatePayoutEvent(client, affiliatePayoutId, "approved", undefined, adminId);

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

// ─── Admin processes affiliate payout ──────────────────────────────────────────

export const processAffiliatePayout = async (
  affiliatePayoutId: string,
  adminId: string
): Promise<AffiliatePayout> => {
  let payout: AffiliatePayout;

  // Lock and mark as processing before any Paystack calls — prevents
  // double-send if this endpoint is retried concurrently, same reasoning
  // as processPayout for creators
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [lockedPayout] } = await client.query<AffiliatePayout>(
      `SELECT * FROM affiliate_payouts WHERE id = $1 AND status = 'approved' FOR UPDATE`,
      [affiliatePayoutId]
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
      `UPDATE affiliate_payouts SET status = 'processing', processed_at = NOW() WHERE id = $1`,
      [affiliatePayoutId]
    );

    await recordAffiliatePayoutEvent(client, affiliatePayoutId, "processing", undefined, adminId);

    await client.query("COMMIT");
    payout = lockedPayout;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Paystack calls outside the transaction — failure leaves status as
  // 'processing', same recovery story as creator payouts
  try {
    const affiliateUserId = payout.affiliate_user_id;

    const recipientCode = await ensurePaystackRecipient(
      async () => {
        const { rows: [user] } = await pool.query<{ paystack_recipient_code: string | null }>(
          `SELECT paystack_recipient_code FROM users WHERE id = $1`,
          [affiliateUserId]
        );
        return user?.paystack_recipient_code ?? null;
      },
      async (code: string) => {
        await pool.query(
          `UPDATE users SET paystack_recipient_code = $1 WHERE id = $2`,
          [code, affiliateUserId]
        );
      },
      payout.account_name!,
      payout.account_number!,
      payout.bank_code!
    );

    const transferResult = await sendPaystackTransfer(
      payout.amount_cents,
      recipientCode,
      `CreatorLock affiliate payout — ${affiliatePayoutId}`,
      payout.idempotency_key ?? affiliatePayoutId
    );

    const { rows: [updated] } = await pool.query<AffiliatePayout>(
      `UPDATE affiliate_payouts
       SET paystack_transfer_code = $1
       WHERE id = $2
       RETURNING *`,
      [transferResult.transfer_code, affiliatePayoutId]
    );

    if (!updated) throw new Error("Failed to store transfer code");
    return updated;
  } catch (err) {
    await pool.query(
      `UPDATE affiliate_payouts SET failure_reason = $1 WHERE id = $2`,
      [(err as Error).message, affiliatePayoutId]
    );
    throw err;
  }
};

// ─── Webhook handler (driven by Paystack transfer webhooks) ───────────────────
// Paystack has exactly one webhook URL for the whole integration — every
// transfer.* event lands here regardless of whether it belongs to a creator
// payout or an affiliate payout. This looks up by transfer_code and no-ops
// if nothing matches, same as handlePayoutWebhook, so the receiving
// controller can safely call both handlers for every transfer.* event —
// whichever one actually owns that transfer code does the update, the
// other one quietly does nothing.

export const handleAffiliatePayoutWebhook = async (
  event: string,
  data: Record<string, any>
): Promise<void> => {
  const transferCode = data.transfer_code as string;
  const reason       = data.reason as string | undefined;

  if (!transferCode) return;

  const { rows: [payout] } = await pool.query<AffiliatePayout>(
    `SELECT * FROM affiliate_payouts WHERE paystack_transfer_code = $1`,
    [transferCode]
  );

  if (!payout) {
    console.warn(`[affiliatePayoutWebhook] No affiliate payout found for transfer code ${transferCode}`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [locked] } = await client.query<AffiliatePayout>(
      `SELECT * FROM affiliate_payouts WHERE id = $1 FOR UPDATE`,
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

    let newStatus: AffiliatePayout["status"];
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
      `UPDATE affiliate_payouts
       SET status = $1,
           failure_reason = $2,
           processed_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE processed_at END
       WHERE id = $3`,
      [newStatus, newStatus === "failed" || newStatus === "reversed" ? (reason ?? null) : null, payout.id]
    );

    await recordAffiliatePayoutEvent(
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


// ─── Affiliate views own payout history ────────────────────────────────────

export const listAffiliatePayouts = async (
  affiliateUserId: string
): Promise<AffiliatePayout[]> => {
  const { rows } = await pool.query<AffiliatePayout>(
    `SELECT * FROM affiliate_payouts
     WHERE affiliate_user_id = $1
     ORDER BY requested_at DESC`,
    [affiliateUserId]
  );

  return rows;
};

export const listAffiliatePayoutsAdmin = async (
  status?: AffiliatePayout["status"]
): Promise<(AffiliatePayout & { affiliate_name: string; affiliate_email: string })[]> => {
  const { rows } = await pool.query(`
    SELECT
      ap.*,
      u.name  AS affiliate_name,
      u.email AS affiliate_email
    FROM affiliate_payouts ap
    JOIN users u ON u.id = ap.affiliate_user_id
    ${status ? 'WHERE ap.status = $1' : ''}
    ORDER BY ap.requested_at DESC`,
    status ? [status] : []
  );
 
  return rows;
};
