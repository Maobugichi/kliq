import pool from "../config/db.js";
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sendDownloadEmail } from "../utils/mailer.util.js";


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
     JOIN creator_profiles cp ON p.creator_id = cp.user_id
     LEFT JOIN access_tokens at ON at.order_id = o.id
     WHERE o.buyer_id = $1 AND o.status = 'paid'
     ORDER BY o.created_at DESC`,
     [buyerId]
   );
   
   return rows;
}

export const resendDownloadEmail = async (
    buyerId:string,
    orderId:string
):Promise<void> => {
    const { rows:[order] } = await pool.query<{
        id:string;
        product_id:string;
        status:string;
    }>(
        `SELECT id, product_id, status FROM orders
        WHERE id = $1 AND buyer_id = $2 AND status = 'paid'`,
        [orderId, buyerId]
    );

    if (!order) throw new Error('Order not found or not paid');

    const { rows: [token] } = await pool.query<{
        id:string;
        token_hash:string;
        used_count:number;
        max_downloads:number;
        revoked:boolean;
        expires_at:Date
    }>(
        `SELECT * FROM access_token WHERE order_id = $1`,
        [orderId]
    );

    if (!token) throw new Error('Access token not found for this order');
    if (token.revoked) throw new Error('Access has been revoked forthis order');

    const { rows:[buyer] } = await pool.query<{email:string; name:string}>(
        `SELECT  email,name FROMusers WHERE id = $1`,
        [buyerId]
    );
    
    if (!buyer) throw new Error('Buyer not found');

    const { rows: [product] } = await pool.query<{title:string}>(
        'SELECT title FROM products WHERE id = $1',
        [order.product_id]
    );

    if (!product) throw new Error('Product not found');

    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newHash = await bcrypt.hash(newRawToken,10);

    await pool.query(
        `UPDATE access_token SET token_hash = $1 WHERE id =$2`,
        [newHash, token.id]
    );

    await sendDownloadEmail(buyer.email, buyer.name, product.title,newRawToken)
}