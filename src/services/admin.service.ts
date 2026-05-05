import pool from "../config/db.js";
import { CreatorStatus, type CreatorProfile } from "../types.ts/creator.types.js";
import {
  updateCreatorStatus,
  findCreatorByUserId,
} from "./creator.service.js";
import { revokeAccessToken } from "./access-token.service.js";
import type { Order } from "./payment.service.js";



export const getAllCreators = async (
  status?: string
): Promise<CreatorProfile[]> => {
  const validStatuses = Object.values(CreatorStatus);

  if (status && !validStatuses.includes(status as CreatorStatus)) {
    throw new Error(`Invalid status. Valid values: ${validStatuses.join(", ")}`);
  }

  const { rows } = await pool.query<CreatorProfile>(
    status
      ? `SELECT * FROM creator_profiles WHERE status = $1 ORDER BY created_at DESC`
      : `SELECT * FROM creator_profiles ORDER BY created_at DESC`,
    status ? [status] : []
  );

  return rows;
};

export const approveCreator = async (userId: string): Promise<CreatorProfile> => {
  const profile = await findCreatorByUserId(userId);

  if (!profile) throw new Error("Creator not found");

  if (profile.status !== CreatorStatus.PENDING) {
    throw new Error(`Creator is not pending — current status: ${profile.status}`);
  }

  return updateCreatorStatus(userId, CreatorStatus.ACTIVE);
};

export const rejectCreator = async (
  userId: string,
  reason: string
): Promise<CreatorProfile> => {
  const profile = await findCreatorByUserId(userId);

  if (!profile) throw new Error("Creator not found");

  return updateCreatorStatus(userId, CreatorStatus.REJECTED, reason);
};

export const suspendCreator = async (
  userId: string,
  reason: string
): Promise<CreatorProfile> => {
  const profile = await findCreatorByUserId(userId);

  if (!profile) throw new Error("Creator not found");

  if (profile.status === CreatorStatus.SUSPENDED) {
    throw new Error("Creator is already suspended");
  }

  return updateCreatorStatus(userId, CreatorStatus.SUSPENDED, reason);
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export const revokeOrder = async (orderId: string): Promise<void> => {
  const { rows: [order] } = await pool.query<Order>(
    `UPDATE orders SET status = 'refunded', updated_at = NOW()
     WHERE id = $1 AND status = 'paid'
     RETURNING *`,
    [orderId]
  );

  if (!order) {
    throw new Error("Order not found or not in paid status");
  }

  await revokeAccessToken(orderId);
};