import bcrypt from "bcrypt";
import pool from "../config/db.js";
import { generateAccessToken, generateRefreshToken } from "../utils/token.util.js";
import type { UserProp } from "../types/global.types.js";
import { CreatorStatus } from "../types/creator.types.js";
import { enqueueEmailVerification } from "../utils/emailqueue.js";

export type SignupInput = Pick<UserProp, "email"> & { password: string };
export type LoginInput = Pick<UserProp, "email"> & { password: string };

export type OnboardingInput = {
  role: "creator" | "buyer";
  name: string;
  storeSlug?: string; 
};


export const signupService = async (data: SignupInput) => {
  const { email, password } = data;

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1", [email]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, email_verified, role)
     VALUES ($1, $2, false, null)
     RETURNING id, email`,
    [email, passwordHash]
  );

  
  await enqueueEmailVerification(user.id, user.email);

  const accessToken = generateAccessToken({
    id:user.id,
    email:user.email,}
);
  const refreshToken = await generateRefreshToken(user.id);

  
  return { message: "Verification email sent" , user: { id: user.id, email: user.email, }, accessToken, refreshToken };
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
       RETURNING id, email, role, name`,
      [role, name, userId]
    );

    if (role === "creator") {
    
      const { rows: [conflict] } = await client.query(
        "SELECT id FROM creator_profiles WHERE store_slug = $1 AND user_id != $2",
        [storeSlug, userId]
      );

      if (conflict) throw new Error("Slug already taken");

      await client.query(
        `INSERT INTO creator_profiles (user_id, display_name, store_slug, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
         SET display_name = $2, store_slug = $3`,
        [userId, name, storeSlug, CreatorStatus.ACTIVE]
      );
    }

    await client.query("COMMIT");

    const accessToken = generateAccessToken({
      id:user.id,
      email:user.email,
      role:user.role
    });
    //const refreshToken = await generateRefreshToken(user.id);
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

  const accessToken = generateAccessToken({
    id:user.id,
    email:user.email,
    role:user.role
  });
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
    "SELECT id, email, role, name FROM users WHERE id = $1",
    [matchedToken.user_id]
  );

  const user = userResult.rows[0];
  const newAccessToken = generateAccessToken(user);

  return { accessToken: newAccessToken ,  user: { id: user.id, email: user.email, role: user.role, name: user.name }};
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

