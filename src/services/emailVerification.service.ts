import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import { sendVerificationEmail } from "../utils/mailer.util.js";

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
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  await sendVerificationEmail(email, rawToken);
};

export const verifyEmailToken = async (rawToken: string): Promise<void> => {
  const { rows } = await pool.query<EmailVerificationToken>(
    `SELECT * FROM email_verification_tokens
     WHERE used = false AND expires_at > NOW()`
  );

  let matched: EmailVerificationToken | null = null;
  for (const row of rows) {
    const isMatch = await bcrypt.compare(rawToken, row.token_hash);
    if (isMatch) {
      matched = row;
      break;
    }
  }

  if (!matched) throw new Error("Invalid or expired verification token");

  // Must use a client to guarantee BEGIN/COMMIT/ROLLBACK hit the same connection.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE email_verification_tokens SET used = true WHERE id = $1`,
      [matched.id]
    );
    await client.query(
      `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
      [matched.user_id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};