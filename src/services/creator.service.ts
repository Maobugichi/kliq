import pool from "../config/db.js";
import { CreatorStatus, type CreatorProfile, type UpdateCreatorProfileInput } from "../types.ts/creator.types.js";

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