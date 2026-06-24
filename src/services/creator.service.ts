import pool from "../config/db.js";
import { enqueueBuyerBroadcast } from "../utils/emailqueue.js";
import type { BuyerEmailTemplate } from "../types/email.types.js";
import { CreatorStatus, type BuyerRow, type CreatorProfile, type UpdateCreatorProfileInput } from "../types/creator.types.js";

export const findCreatorByUserId = async (
  userId: string
): Promise<CreatorProfile | null> => {
  const { rows: [profile] } = await pool.query<CreatorProfile>(
    "SELECT * FROM creator_profiles WHERE user_id = $1",
    [userId]
  );
  return profile ?? null;
};

export const findCreatorBySlug = async (
  slug: string
): Promise<CreatorProfile | null> => {
  const { rows: [profile] } = await pool.query<CreatorProfile>(
    `SELECT * FROM creator_profiles WHERE store_slug = $1 AND status = $2`,
    [slug, CreatorStatus.ACTIVE]
  );
  return profile ?? null;
};

export const isCreatorActive = async (userId: string): Promise<boolean> => {
  const profile = await findCreatorByUserId(userId);
  return profile?.status === CreatorStatus.ACTIVE;
};

export const createCreatorProfile = async (
  userId: string,
  displayName: string,
  storeSlug: string
): Promise<CreatorProfile> => {
  const { rows: [existing] } = await pool.query<{ id: string }>(
    "SELECT id FROM creator_profiles WHERE store_slug = $1",
    [storeSlug]
  );

  if (existing) throw new Error("Store slug is already taken");

  const { rows: [profile] } = await pool.query<CreatorProfile>(
    `INSERT INTO creator_profiles (user_id, display_name, store_slug, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, displayName, storeSlug, CreatorStatus.PENDING]
  );

  if (!profile) throw new Error("Failed to create creator profile");
  return profile;
};

export const updateCreatorProfile = async (
  userId: string,
  updates: UpdateCreatorProfileInput
): Promise<CreatorProfile> => {
  const allowedFields = [
    "display_name",
    "bio",
    "profile_image",
    "banner_image",
    "social_links",
    "store_customization",
  ] as const;

  const setClause: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClause.push(`${field} = $${paramCount}`);
      values.push(updates[field]);
      paramCount++;
    }
  }

  if (setClause.length === 0) throw new Error("No valid fields to update");

  setClause.push(`updated_at = NOW()`);
  values.push(userId);

  const { rows: [profile] } = await pool.query<CreatorProfile>(
    `UPDATE creator_profiles
     SET ${setClause.join(", ")}
     WHERE user_id = $${paramCount}
     RETURNING *`,
    values
  );

  if (!profile) throw new Error("Creator profile not found");
  return profile;
};

export const updateCreatorStatus = async (
  userId: string,
  status: CreatorStatus,
  reason?: string
): Promise<CreatorProfile> => {
  const setClause: string[] = ["status = $1", "updated_at = NOW()"];
  const values: unknown[] = [status];
  let paramCount = 2;

  if (status === CreatorStatus.SUSPENDED) {
    setClause.push(`suspended_reason = $${paramCount}`, `suspended_at = NOW()`);
    values.push(reason ?? null);
    paramCount++;
  }

  if (status === CreatorStatus.REJECTED) {
    setClause.push(`rejected_reason = $${paramCount}`);
    values.push(reason ?? null);
    paramCount++;
  }

  if (status === CreatorStatus.ACTIVE) {
    setClause.push(`verified_at = NOW()`);
  }

  values.push(userId);

  const { rows: [profile] } = await pool.query<CreatorProfile>(
    `UPDATE creator_profiles
     SET ${setClause.join(", ")}
     WHERE user_id = $${paramCount}
     RETURNING *`,
    values
  );

  if (!profile) throw new Error("Creator profile not found");
  return profile;
};

export const isSlugAvailable = async (slug: string): Promise<boolean> => {
  const { rows: [existing] } = await pool.query(
    "SELECT id FROM creator_profiles WHERE store_slug = $1",
    [slug]
  );
  return !existing;
};


export const getBuyersForCreator = async (userId: string): Promise<BuyerRow[]> => {
  // Resolve the creator profile id from the logged-in user's id
  const { rows: [profile] } = await pool.query<{ id: string }>(
    `SELECT id FROM creator_profiles WHERE user_id = $1`,
    [userId]
  );

  if (!profile) throw new Error('Creator profile not found');

  console.log('[getBuyers] resolved creator profile id:', profile.id);

  // creator.service.ts
  const { rows } = await pool.query(
    `SELECT
      u.id                          AS buyer_id,
      u.name                        AS name,
      u.email                       AS email,
      u.profile_image,
      COUNT(o.id)                   AS total_purchases,
      SUM(o.amount_cents)           AS total_spent_cents,
      MAX(o.created_at)             AS last_purchase_at
    FROM orders o
    JOIN users    u ON u.id = o.buyer_id
    JOIN products p ON p.id = o.product_id
    WHERE p.creator_id = $1
      AND o.status = 'paid'
    GROUP BY u.id, u.name, u.email, u.profile_image
    ORDER BY last_purchase_at DESC`,
    [profile.id]
  );

    
  return rows;
};


// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendBuyerEmailPayload {
  buyerIds: string[];
  template: BuyerEmailTemplate;
  subject: string;
  body: string;
  couponCode?: string;
  productTitle?: string;
  productUrl?: string;
}

interface ResolvedBuyer {
  id: string;
  name: string;
  email: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const sendEmailToBuyers = async (
  creatorUserId: string,
  payload: SendBuyerEmailPayload
): Promise<{ queued: number }> => {
  // 1. Resolve creator profile + name
  const { rows: [creator] } = await pool.query<{ id: string; name: string }>(
    `SELECT cp.id, u.name
     FROM creator_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = $1`,
    [creatorUserId]
  );

  if (!creator) throw new Error("Creator profile not found");

  // 2. Resolve buyers — only allow buyers who actually purchased from this creator.
  //    This prevents a creator from emailing arbitrary user IDs.
  const { rows: buyers } = await pool.query<ResolvedBuyer>(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     JOIN orders o ON o.buyer_id = u.id
     JOIN products p ON p.id = o.product_id
     WHERE p.creator_id = $1
       AND o.status = 'paid'
       AND u.id = ANY($2::uuid[])`,
    [creator.id, payload.buyerIds]
  );

  if (buyers.length === 0) {
    throw new Error("No valid buyers found for the provided IDs");
  }

  // 3. Enqueue one job per buyer so failures are isolated —
  //    one bad email address won't block the rest of the batch.
  await Promise.all(
    buyers.map((buyer) =>
      enqueueBuyerBroadcast({
        to: buyer.email,
        buyerName: buyer.name,
        creatorName: creator.name,
        template: payload.template,
        subject: payload.subject,
        body: payload.body,
        ...(payload.couponCode   && { couponCode:   payload.couponCode }),
        ...(payload.productTitle && { productTitle: payload.productTitle }),
        ...(payload.productUrl   && { productUrl:   payload.productUrl }),
      })
    )
  );

  return { queued: buyers.length };
};