import pool from '../config/db.js';

export interface Notification {
    id:string;
    user_id:string;
    type:string;
    title:string;
    message:string;
    read:boolean;
    metadata:Record<string , unknown> | null;
    created_at:Date;
} 

import { getIO } from "../socket.js";

export const createNotification = async(
    userId:string,
    type:string,
    title:string,
    message:string,
    metadata?:Record<string,unknown>
):Promise<void> => {
    const { rows: [notification] } = await pool.query(
        `INSERT INTO notifications(user_id, type, title, message, metadata)
        VALUES($1, $2, $3, $4, $5)
        RETURNING *`,
        [userId, type, title, message, metadata]
    );

    try {
      getIO().to(`user:${userId}`).emit("notification:new", notification);
    } catch {
      
    }
};


export const notifyNewSale = async(
    creatorId:string,
    productTitle:string,
    amountCents:number,
    buyerName:string
):Promise<void> => {
    const amountNGN = (amountCents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'NGN',
    });

    await createNotification(
        creatorId,
        'new_sale',
        "New sale 🎉",
        `${buyerName} just purchased "${productTitle}" for ${amountNGN}`,
        { product_title: productTitle, amount_cents: amountCents, buyer_name: buyerName }
    );
};

export const getNotifications = async (
  userId: string,
  unreadOnly = false
): Promise<Notification[]> => {
  const { rows } = await pool.query<Notification>(
    `SELECT * FROM notifications
     WHERE user_id = $1 ${unreadOnly ? "AND read = false" : ""}
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
};

export const markAsRead = async (
  notificationId: string,
  userId: string
): Promise<void> => {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET read = true
     WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
 
  if (!rowCount || rowCount === 0) {
    throw new Error("Notification not found");
  }
};
 

export const markAllAsRead = async (userId: string): Promise<void> => {
  await pool.query(
    `UPDATE notifications SET read = true
     WHERE user_id = $1 AND read = false`,
    [userId]
  );
};
 
// ─── Unread count ─────────────────────────────────────────────────────────────
 
export const getUnreadCount = async (userId: string): Promise<number> => {
  const { rows: [row] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false`,
    [userId]
  );
  return parseInt(row?.count ?? "0", 10);
};

export const notifyAffiliateSale = async (
  creatorId: string,
  productTitle: string,
  amountCents: number,
  buyerName: string,
  affiliateName: string
): Promise<void> => {
  const amountNGN = (amountCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'NGN',
  });

  await createNotification(
    creatorId,
    'affiliate_sale',
    'Affiliate sale 🤝',
    `${affiliateName} just drove a sale of "${productTitle}" for ${amountNGN}`,
    { product_title: productTitle, amount_cents: amountCents, buyer_name: buyerName, affiliate_name: affiliateName }
  );
};

export const notifyCommissionEarned = async (
  affiliateUserId: string,
  productTitle: string,
  commissionCents: number
): Promise<void> => {
  const amountNGN = (commissionCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'NGN',
  });

  await createNotification(
    affiliateUserId,
    'commission_earned',
    'Commission earned 💰',
    `You earned ${amountNGN} in commission on a sale of "${productTitle}"`,
    { product_title: productTitle, commission_cents: commissionCents }
  );
};

// notification.service.ts — add

export const broadcastToCreators = async (
  title: string,
  message: string
): Promise<void> => {
  const { rows: creators } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM creator_profiles`
  );

  await Promise.all(
    creators.map((c) =>
      createNotification(c.user_id, 'app_update', title, message)
    )
  );
};