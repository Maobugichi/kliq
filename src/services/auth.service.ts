import bcrypt from "bcrypt";
import pool from "../config/db.js";
import { generateAccessToken, generateRefreshToken } from "../utils/token.util.js";
import type { UserProp } from "../types/global.types.js";
import { CreatorStatus } from "../types/creator.types.js";
import { enqueueEmailVerification } from "../utils/emailqueue.js";
import jwt from "jsonwebtoken"

export type SignupInput = Pick<UserProp, "email"> & { password: string };
export type LoginInput = Pick<UserProp, "email"> & { password: string };

export type OnboardingInput = {
  role: "creator" | "buyer";
  name: string;
  storeSlug?: string; 
};


export const signupService = async (data: SignupInput) => {
  const { email, password } = data;

 
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email address");
  }
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (password.length > 72) {
    throw new Error("Password must be under 72 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let user: { id: string; email: string } | undefined;

  try {
    const { rows: [inserted] } = await pool.query<{ id: string; email: string }>(
      `INSERT INTO users (email, password_hash, email_verified, role)
       VALUES ($1, $2, false, null)
       RETURNING id, email`,
      [email, passwordHash]
    );
    user = inserted;
  } catch (err: any) {
    if (err.code === '23505') {
      throw new Error("An account with this email already exists");
    }
    throw err;
  }

  if (!user) throw new Error("Failed to create account");

  await enqueueEmailVerification(user.id, user.email);

  const accessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    email_verified: false,  // ← add this
  });
  const refreshToken = await generateRefreshToken(user.id);

  return {
    message: "Verification email sent",
    user: { id: user.id, email: user.email },
    accessToken,
    refreshToken,
  };
};

export const completeOnboardingService = async (
  userId: string,
  data: OnboardingInput
) => {
  const { role, name, storeSlug } = data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: [user] } = await client.query(
      `UPDATE users SET role = $1, name = $2, is_onboarded = true
       WHERE id = $3
       RETURNING id, email, role, name, email_verified`,
      [role, name, userId]
    );

    if (role === "creator") {
      if (!storeSlug?.trim()) {
        throw new Error("Store slug is required for creators");
      }
      try {
          await client.query(
              `INSERT INTO creator_profiles (user_id, display_name, store_slug, status)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (user_id) DO UPDATE
              SET display_name = $2, store_slug = $3`,
              [userId, name, storeSlug, CreatorStatus.ACTIVE]
          );
      } catch (err: any) {
          if (err.code === '23505' && err.constraint === 'creator_profiles_store_slug_key') {
              throw new Error("Slug already taken");
          }
          throw err;
      }
    }

    await client.query("COMMIT");

    const accessToken = generateAccessToken({
      id:user.id,
      email:user.email,
      role:user.role,
      email_verified: user.email_verified
    });



    return { user: { id: user.id, email: user.email, role: user.role, name: user.name }, accessToken };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export const loginService = async (data: LoginInput) => {
  const { email, password } = data;

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const result = await pool.query(
    "SELECT id, email, role, name, password_hash, email_verified FROM users WHERE email = $1",
    [email]
  );

  if (result.rowCount === 0) {
    throw new Error("Invalid credentials");
  }

  const user = result.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) throw new Error("Invalid credentials");

  if (!user.email_verified) {
    throw new Error("Please verify your email before continuing");
  }

  const accessToken = generateAccessToken({
    id:user.id,
    email:user.email,
    role:user.role,
    email_verified: user.email_verified, 
  });
  const refreshToken = await generateRefreshToken(user.id);
  
  const { password_hash, ...safeUser } = user;
  return {
    user: safeUser,
    accessToken,
    refreshToken,
  };
};

export const refreshTokenService = async (data: { refreshToken: string }) => {
  const { refreshToken } = data;

  if (!refreshToken) throw new Error("Refresh token required");

  let payload: { userId: string; tokenId: string };
  try {
    payload = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string
    ) as { userId: string; tokenId: string };
  } catch {
    throw new Error("Invalid refresh token");
  }
  
  const { rows: [tokenRow] } = await pool.query<{
    id: string;
    token_hash: string;
    user_id: string;
  }>(
    `SELECT id, token_hash, user_id
     FROM refresh_tokens
     WHERE id = $1
       AND revoked = false
       AND expires_at > NOW()`,
    [payload.tokenId]
  );

  if (!tokenRow) throw new Error("Invalid refresh token");

  const isMatch = await bcrypt.compare(refreshToken, tokenRow.token_hash);
  if (!isMatch) throw new Error("Invalid refresh token");

  const { rows: [user] } = await pool.query<{
    id: string;
    email: string;
    role: string;
    name: string;
    email_verified:boolean
  }>(
    `SELECT id, email, role, name, email_verified FROM users WHERE id = $1`,
    [tokenRow.user_id]
  );

  if (!user) throw new Error("User not found");

  const newAccessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role as "creator" | "buyer" | "admin",
    email_verified: user.email_verified
  });

  return { accessToken: newAccessToken ,  user: { id: user.id, email: user.email, role: user.role, name: user.name }};
};

export const logoutService = async (data: { refreshToken: string }) => {
  const { refreshToken } = data;

  if (!refreshToken) throw new Error("Refresh token required");

  let payload: { userId: string; tokenId: string };
  try {
    payload = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string
    ) as { userId: string; tokenId: string };
  } catch {
    throw new Error("Invalid refresh token");
  }

const { rows: [tokenRow] } = await pool.query<{
    id: string;
    token_hash: string;
  }>(
    `SELECT id, token_hash
     FROM refresh_tokens
     WHERE id = $1
       AND revoked = false
       AND expires_at > NOW()`,
    [payload.tokenId]
  );

  if (!tokenRow) throw new Error("Invalid or already revoked refresh token");

  const isMatch = await bcrypt.compare(refreshToken, tokenRow.token_hash);
  if (!isMatch) throw new Error("Invalid or already revoked refresh token");
  
  await pool.query(
    `UPDATE refresh_tokens SET revoked = true, revoked_at = NOW() WHERE id = $1`,
    [tokenRow.id]
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

