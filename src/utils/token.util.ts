import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import type { AccessTokenPayload } from "../types.ts/token.types.js";

export const generateAccessToken = (user: {
  id: string;
  email: string;
  role: string;
}): string => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "15m" }
  );
};

export const generateRefreshToken = async (userId: string): Promise<string> => {
  const token = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: "30d" }
  );

  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return token;
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET as string) as AccessTokenPayload;
};