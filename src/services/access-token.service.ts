import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import cloudinary from "../config/cloudinary.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccessToken {
  id: string;
  buyer_id: string;
  product_id: string;
  order_id: string;
  token_hash: string;
  expires_at: Date;
  used_count: number;
  max_downloads: number;
  revoked: boolean;
  created_at: Date;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export const generateAccessToken = async (
  buyerId: string,
  productId: string,
  orderId: string
): Promise<string> => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO access_tokens
       (buyer_id, product_id, order_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [buyerId, productId, orderId, tokenHash, expiresAt]
  );

  return rawToken;
};

// ─── Validate + get signed URL ────────────────────────────────────────────────

export const redeemAccessToken = async (
  rawToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{downloads: { filename: string | null; url:string }[]}> => {
  const { rows } = await pool.query<AccessToken>(
    `SELECT * FROM access_tokens
     WHERE revoked = false AND expires_at > NOW()`
  );

  let matched: AccessToken | null = null;

  for (const row of rows) {
    const isMatch = await bcrypt.compare(rawToken, row.token_hash);
    if (isMatch) {
      matched = row;
      break;
    }
  }

  if (!matched) throw new Error("Invalid or expired download token");

  if (matched.used_count >= matched.max_downloads) {
    throw new Error("Download limit reached for this purchase");
  }


  const { rows: files } = await pool.query<{
    public_id: string;
    original_name: string | null;
    format: string | null;
  }>(
    `SELECT public_id, original_name, format
     FROM product_files
     WHERE product_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [matched.product_id]
  );

  if (!files.length) throw new Error("Product file not found");

 
  await pool.query("BEGIN");
  try {
    await pool.query(
      `UPDATE access_tokens
       SET used_count = used_count + 1
       WHERE id = $1`,
      [matched.id]
    );

    await pool.query(
      `INSERT INTO download_logs
         (buyer_id, product_id, access_token_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        matched.buyer_id,
        matched.product_id,
        matched.id,
        ipAddress ?? null,
        userAgent ?? null,
      ]
    );

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  
  const downloads = files.map((file) => {
    filename:file.original_name,
    url:cloudinary.url(file.public_id, {
      secure:true,
      sign_url:true,
      expires_at:Math.floor(Date.now() / 1000) = 10 * 60,
      resource_type:'auto'
    })
  });

  return { downloads } 
};

// ─── Revoke ───────────────────────────────────────────────────────────────────

export const revokeAccessToken = async (orderId: string): Promise<void> => {
  const { rowCount } = await pool.query(
    `UPDATE access_tokens SET revoked = true WHERE order_id = $1`,
    [orderId]
  );

  if (!rowCount || rowCount === 0) {
    throw new Error("Access token not found for this order");
  }
};