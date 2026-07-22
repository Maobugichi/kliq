import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import { sendVerificationEmail } from "../utils/mailer.util.js";
import { generateAccessToken } from "../utils/token.util.js";

interface EmailVerificationToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

const invalidatePreviousTokens = async (userId: string): Promise<void> => {
  await pool.query(
    `UPDATE email_verification_tokens
     SET used = true
     WHERE user_id = $1 AND used = false`,
    [userId]
  );
};

export const sendEmailVerification = async (
  userId: string,
  email: string
): Promise<void> => {
  await invalidatePreviousTokens(userId);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  
  const { rows: [row] } = await pool.query<{ id: string }>(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, '', $2)
     RETURNING id`,
    [userId, expiresAt]
  );

  if (!row) throw new Error("Failed to create verification token");

 
  const tokenWithId = `${row.id}~${rawToken}`;
  const tokenHash = await bcrypt.hash(tokenWithId, 10);

  await pool.query(
    `UPDATE email_verification_tokens SET token_hash = $1 WHERE id = $2`,
    [tokenHash, row.id]
  );

  await sendVerificationEmail(email, tokenWithId);
};

export const verifyEmailToken = async (rawToken: string): Promise<{ accessToken: string }> => {
  // Extract the id from the token
  const [tokenId, secret] = rawToken.split("~");
  if (!tokenId || !secret) throw new Error("Invalid or expired verification token");

  // Single row lookup
  const { rows: [row] } = await pool.query<EmailVerificationToken>(
    `SELECT * FROM email_verification_tokens
     WHERE id = $1
       AND used = false
       AND expires_at > NOW()`,
    [tokenId]
  );

  if (!row) throw new Error("Invalid or expired verification token");

  const isMatch = await bcrypt.compare(rawToken, row.token_hash);
  if (!isMatch) throw new Error("Invalid or expired verification token");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE email_verification_tokens SET used = true WHERE id = $1`,
      [row.id]
    );

    const { rows: [user] } = await client.query<{
      id: string;
      email: string;
      role: string;
    }>(
      `UPDATE users SET email_verified = true, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, role`,
      [row.user_id]
    );

    await client.query("COMMIT");

    if (!user) throw new Error("User not found");

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role as "creator" | "buyer" | "admin",
      email_verified: true,
    });

    return { accessToken };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};