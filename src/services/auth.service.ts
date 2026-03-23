import bcrypt from "bcrypt";
import pool from "../config/db.js";
import { generateAccessToken, generateRefreshToken } from "../utils/token.util.js";
import type { UserProp } from "../types.ts/global.types.js";

export type SignupInput = Pick<UserProp, "email" | "name"> & { password: string };
export type LoginInput = Pick<UserProp, "email"> & { password: string };

export const signupService = async (data: SignupInput) => {
  const { email, password, name } = data;

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    throw new Error("Email already in use");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, 'buyer', $3)
     RETURNING id, email, role, name`,
    [email, passwordHash, name]
  );

  const user = result.rows[0];
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return { user, accessToken, refreshToken };
};

export const loginService = async (data: LoginInput) => {
  const { email, password } = data;

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  if (result.rowCount === 0) {
    throw new Error("Invalid credentials");
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) throw new Error("Invalid credentials");

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
    accessToken,
    refreshToken,
  };
};

export const refreshTokenService = async (data: { refreshToken: string }) => {
  const { refreshToken } = data;

  if (!refreshToken) throw new Error("Refresh token required");

  const tokens = await pool.query(
    `SELECT * FROM refresh_tokens WHERE revoked = false AND expires_at > NOW()`
  );

  let matchedToken = null;

  for (const row of tokens.rows) {
    const isMatch = await bcrypt.compare(refreshToken, row.token_hash);
    if (isMatch) {
      matchedToken = row;
      break;
    }
  }

  if (!matchedToken) throw new Error("Invalid refresh token");

  const userResult = await pool.query(
    "SELECT id, email, role FROM users WHERE id = $1",
    [matchedToken.user_id]
  );

  const user = userResult.rows[0];
  const newAccessToken = generateAccessToken(user);

  return { accessToken: newAccessToken };
};

export const logoutService = async (data: { refreshToken: string }) => {
  const { refreshToken } = data;

  if (!refreshToken) throw new Error("Refresh token required");

  const tokens = await pool.query(
    `SELECT * FROM refresh_tokens WHERE revoked = false AND expires_at > NOW()`
  );

  let matchedToken = null;

  for (const row of tokens.rows) {
    const isMatch = await bcrypt.compare(refreshToken, row.token_hash);
    if (isMatch) {
      matchedToken = row;
      break;
    }
  }

  if (!matchedToken) throw new Error("Invalid or already revoked refresh token");

  await pool.query(
    `UPDATE refresh_tokens SET revoked = true, revoked_at = NOW() WHERE id = $1`,
    [matchedToken.id]
  );

  return { message: "Logout successful" };
};

export const logoutAllService = async (data: { userId: string }) => {
  const { userId } = data;

  const result = await pool.query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = NOW()
     WHERE user_id = $1 AND revoked = false`,
    [userId]
  );

  return {
    message: "Logged out from all devices",
    tokensRevoked: result.rowCount ?? 0,
  };
};