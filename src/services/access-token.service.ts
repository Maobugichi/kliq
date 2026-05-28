import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import { Pool, type PoolClient } from "pg";


export interface AccessToken {
  id: string;
  buyer_id: string;
  product_id: string;
  order_id: string;
  token_id: string;
  token_hash: string;
  expires_at: Date;
  used_count: number;
  max_downloads: number;
  revoked: boolean;
  created_at: Date;
}

/**
 * GENERATE ACCESS TOKEN
 */
export const generateAccessToken = async (
  buyerId: string,
  productId: string,
  orderId: string,
   db: Pool | PoolClient = pool 
): Promise<string> => {
  /**
   * TOKEN FORMAT:
   * tokenId.secret
   */

  const tokenId = `atk_${crypto.randomUUID()}`;

  const secret = crypto.randomBytes(32).toString("hex");

  const rawToken = `${tokenId}~${secret}`;

 
  const tokenHash = await bcrypt.hash(secret, 10);

  const expiresAt = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000
  );

  await db.query(
    `
    INSERT INTO access_tokens
    (
      buyer_id,
      product_id,
      order_id,
      token_id,
      token_hash,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      buyerId,
      productId,
      orderId,
      tokenId,
      tokenHash,
      expiresAt,
    ]
  );

  return rawToken;
};





/**
 * REDEEM ACCESS TOKEN
 */
export const redeemAccessToken = async (
  rawToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{
  downloads: {
    filename: string | null;
    url: string;
  }[];
}> => {
 
  const [tokenId, secret] = rawToken.split("~");

  if (!tokenId || !secret) {
    throw new Error("Invalid token format");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /**
     * CONCURRENCY SAFE:
     * Lock token row during redemption
     */
    const { rows } = await client.query<AccessToken>(
      `
      SELECT *
      FROM access_tokens
      WHERE token_id = $1
        AND revoked = false
        AND expires_at > NOW()
      FOR UPDATE
      `,
      [tokenId]
    );

    const matched = rows[0];

    if (!matched) {
      throw new Error("Invalid or expired download token");
    }
    
    

    const isMatch = await bcrypt.compare(
      secret,
      matched.token_hash
    );


    if (!isMatch) {
      throw new Error("Invalid or expired download token");
    }

    if (matched.used_count >= matched.max_downloads) {
      throw new Error(
        "Download limit reached for this purchase"
      );
    }

    const { rows: files } = await client.query<{
      public_id: string;
      original_name: string | null;
      format: string | null;
    }>(
      `
      SELECT public_id, original_name, format
      FROM product_files
      WHERE product_id = $1
      ORDER BY created_at ASC
      `,
      [matched.product_id]
    );

    if (!files.length) {
      throw new Error("Product file not found");
    }

    /**
     * Increment usage count
     */
    await client.query(
      `
      UPDATE access_tokens
      SET used_count = used_count + 1
      WHERE id = $1
      `,
      [matched.id]
    );

    /**
     * Log download
     */
    await client.query(
      `
      INSERT INTO download_logs
      (
        buyer_id,
        product_id,
        access_token_id,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        matched.buyer_id,
        matched.product_id,
        matched.id,
        ipAddress ?? null,
        userAgent ?? null,
      ]
    );

    await client.query("COMMIT");

    /**
     * Generate signed download URLs
     */
    
    const downloads = files.map((file) => ({
      filename: file.original_name,
      url: cloudinary.url(file.public_id, {
        secure: true,
        sign_url: true,
        expires_at:
          Math.floor(Date.now() / 1000) + 10 * 60,
        resource_type: "raw",
      }),
    }));

    console.log(downloads)

    return { downloads };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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