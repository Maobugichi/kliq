import pool from "../config/db.js";
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sendDownloadEmail } from "../utils/mailer.util.js";
import { enqueueOrderDownload } from "../utils/emailqueue.js";
import { verifyMagicLinkToken } from "../utils/token.util.js";
import { hashSecret } from "./access-token.service.js";


export interface LibraryItem {
    order_id: string;
    product_id:string;
    product_title:string;
    product_thumbnail:string | null;
    creator_name:string;
    store_slug:string;
    amount_cents:number;
    purchased_at:Date;
    downloads_used:number;
    max_downloads: number;
    token_revoked:boolean;
    token_expires_at:Date;
}

export interface BuyerProfile {
    id: string;
    name: string;
    email: string;
    created_at: Date;
}

export interface MagicLinkBuyer {
    id: string;
    email: string;
    role: "creator" | "buyer" | "admin" | "guest" | null;
    email_verified: boolean;
}

export const getBuyerLibrary = async (
    buyerId:string
):Promise<LibraryItem[]> => {
   const { rows } = await pool.query<LibraryItem>(
    `SELECT
       o.id AS order_id,
       o.product_id,
       p.title AS product_title,
       p.thumbnail AS product_thumbnail,
       cp.display_name AS creator_name,
       cp.store_slug,
       o.amount_cents,
       o.created_at AS purchased_at,
       COALESCE(at.used_count, 0) AS downloads_used,
       COALESCE(at.max_downloads, 3) AS max_downloads,
       COALESCE(at.revoked, false) AS token_revoked,
       at.expires_at AS token_expires_at
     FROM orders o
     JOIN products p ON o.product_id = p.id
     JOIN creator_profiles cp ON p.creator_id = cp.id
     LEFT JOIN access_tokens at ON at.order_id = o.id
     WHERE o.buyer_id = $1 AND o.status = 'paid'
     ORDER BY o.created_at DESC`,
     [buyerId]
   );
   
   return rows;
}

export const resendDownloadEmail = async (
    buyerId: string,
    orderId: string
): Promise<void> => {
    const { rows: [order] } = await pool.query<{
        id: string;
        product_id: string;
        status: string;
    }>(
        `SELECT id, product_id, status FROM orders
        WHERE id = $1 AND buyer_id = $2 AND status = 'paid'`,
        [orderId, buyerId]
    );

    if (!order) throw new Error('Order not found or not paid');

    const { rows: [token] } = await pool.query<{
        id: string;
        token_id: string;
        token_hash: string;
        used_count: number;
        max_downloads: number;
        revoked: boolean;
        expires_at: Date;
    }>(
        `SELECT * FROM access_tokens WHERE order_id = $1`,
        [orderId]
    );

    if (!token) throw new Error('Access token not found for this order');
    if (token.revoked) throw new Error('Access has been revoked for this order');

    const { rows: [buyer] } = await pool.query<{ email: string; name: string }>(
        `SELECT email, name FROM users WHERE id = $1`,
        [buyerId]
    );

    if (!buyer) throw new Error('Buyer not found');

    const { rows: [product] } = await pool.query<{ title: string }>(
        'SELECT title FROM products WHERE id = $1',
        [order.product_id]
    );

    if (!product) throw new Error('Product not found');

    const newSecret = crypto.randomBytes(32).toString('hex');
    const newRawToken = `${token.token_id}~${newSecret}`;
    const newHash = hashSecret(newSecret); 

    await pool.query(
        `UPDATE access_tokens 
         SET token_hash = $1,
             expires_at = NOW() + INTERVAL '365 days'
         WHERE id = $2`,
        [newHash, token.id]
    );

    await enqueueOrderDownload({
    email: buyer.email,
    name: buyer.name,
    productTitle: product.title,
    token: newRawToken,
});
};

export const getBuyerProfile = async (
    buyerId: string
): Promise<BuyerProfile> => {
    const { rows: [user] } = await pool.query<BuyerProfile>(
        `SELECT id, name, email, created_at
         FROM users
         WHERE id = $1`,
        [buyerId]
    );
 
    if (!user) throw new Error('Buyer not found');
 
    return user;
};
 

export const updateBuyerProfile = async (
    buyerId: string,
    fields: { name?: string; email?: string; }
): Promise<BuyerProfile> => {
 
    const setClauses: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;
 
    if (fields.name !== undefined) {
        const trimmed = fields.name.trim();
        if (trimmed.length < 2 || trimmed.length > 100) {
            throw new Error('Name must be between 2 and 100 characters.');
        }
        setClauses.push(`name = $${paramIndex++}`);
        params.push(trimmed);
    }
 
    if (fields.email !== undefined) {
        const normalised = fields.email.trim().toLowerCase();
 
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalised)) {
            throw new Error('A valid email address is required.');
        }
 
        
        const { rows: [conflict] } = await pool.query<{ id: string }>(
            `SELECT id FROM users WHERE email = $1 AND id != $2`,
            [normalised, buyerId]
        );
 
        if (conflict) {
            throw new Error('This email address is already registered to another account.');
        }
 
        setClauses.push(`email = $${paramIndex++}`);
        params.push(normalised);
    }

   
    setClauses.push(`updated_at = NOW()`);
 
   
    params.push(buyerId);
 
    const { rows: [updated] } = await pool.query<BuyerProfile>(
        `UPDATE users
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, name, email, created_at`,
        params
    );
 
    if (!updated) throw new Error('Profile update failed.');
 
    return updated;
};

export const verifyMagicLinkAndGetBuyer = async (
    token: string
): Promise<MagicLinkBuyer> => {
    let buyerId: string;
 
    try {
        ({ buyerId } = verifyMagicLinkToken(token));
    } catch {
        throw new Error('Invalid or expired link');
    }
 
    const { rows: [user] } = await pool.query<{
        id: string;
        email: string;
        role: "creator" | "buyer" | "admin" | "guest" | null;
        email_verified: boolean;
    }>(
        `SELECT id, email, role, email_verified FROM users WHERE id = $1`,
        [buyerId]
    );
 
    if (!user) throw new Error('Invalid or expired link');
 
    return user;
};