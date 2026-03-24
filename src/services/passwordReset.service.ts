import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import { sendPasswordResetEmail } from "../utils/mailer.util.js";

interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

const invalidatePreviousTokens = async (userId: string): Promise<void> => {
  await pool.query(
    `UPDATE password_reset_tokens SET used = true
     WHERE user_id = $1 AND used = false`,
    [userId]
  );
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const { rows: [user] } = await pool.query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE email = $1",
    [email]
  );

  if (!user) return; // Don't leak whether email exists

  await invalidatePreviousTokens(user.id);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  await sendPasswordResetEmail(email, rawToken);
};

export const resetPassword = async (
  rawToken: string,
  newPassword: string
): Promise<void> => {
  const { rows } = await pool.query<PasswordResetToken>(
    `SELECT * FROM password_reset_tokens
     WHERE used = false AND expires_at > NOW()`
  );

  let matched: PasswordResetToken | null = null;

  for (const row of rows) {
    const isMatch = await bcrypt.compare(rawToken, row.token_hash);
    if (isMatch) {
      matched = row;
      break;
    }
  }

  if (!matched) throw new Error("Invalid or expired reset token");

  const newHash = await bcrypt.hash(newPassword, 12);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `UPDATE password_reset_tokens SET used = true WHERE id = $1`,
      [matched.id]
    );
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, matched.user_id]
    );
    await pool.query(
      `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
      [matched.user_id]
    );
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
};