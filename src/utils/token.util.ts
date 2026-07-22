import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import type { AccessTokenPayload } from "../types/token.types.js";
import type { SignOptions } from "jsonwebtoken";

export interface MagicLinkTokenPayload {
  buyerId: string;
}

export const generateAccessToken = (payload: {
  id: string;
  email?: string;
  role?: "creator" | "buyer" | "admin";
  email_verified: boolean;  
},
expiresIn: SignOptions["expiresIn"] = "15m"
): string => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET as string,
    { expiresIn }
  );
};

export const generateRefreshToken = async (userId: string): Promise<string> => {
 
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const { rows: [row] } = await pool.query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, '', $2)
     RETURNING id`,
    [userId, expiresAt]
  );

  if (!row) {
    throw new Error('err inserting token')
  }

   const token = jwt.sign(
    { userId, tokenId:row.id },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: "30d" }
  );

  const tokenHash = await bcrypt.hash(token, 10);

  await pool.query(
    `UPDATE refresh_tokens SET token_hash = $1 WHERE id = $2`,
    [tokenHash, row.id]
  );

  return token;
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET as string) as AccessTokenPayload;
};

export const generateMagicLinkToken = (buyerId: string): string => {
  return jwt.sign(
    { buyerId } satisfies MagicLinkTokenPayload,
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );
};
 
export const verifyMagicLinkToken = (token: string): MagicLinkTokenPayload => {
  return jwt.verify(
    token,
    process.env.JWT_SECRET as string
  ) as MagicLinkTokenPayload;
};