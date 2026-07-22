import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "./db.js";

export interface OAuthUser {
  id: string;
  email: string;
  role: string | null;
  name: string | null;
  is_onboarded: boolean;
  email_verified: boolean;
}

export function initPassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const providerEmail = email?.toLowerCase();

          if (!providerEmail) {
            return done(new Error("No email returned from Google"));
          }

          // 1. Already linked this Google account?
          const { rows: [existingOAuth] } = await pool.query<OAuthUser>(
            `SELECT u.id, u.email, u.role, u.name, u.is_onboarded, u.email_verified
             FROM oauth_accounts oa
             JOIN users u ON u.id = oa.user_id
             WHERE oa.provider = 'google' AND oa.provider_id = $1`,
            [profile.id]
          );

          if (existingOAuth) return done(null, existingOAuth);

          // 2. User exists with this email (signed up with password)?
          const { rows: [existingUser] } = await pool.query<OAuthUser>(
            `SELECT id, email, role, name, is_onboarded, email_verified
             FROM users WHERE email = $1`,
            [providerEmail]
          );

          if (existingUser) {
            await pool.query(
              `INSERT INTO oauth_accounts (user_id, provider, provider_id)
               VALUES ($1, 'google', $2)
               ON CONFLICT (provider, provider_id) DO NOTHING`,
              [existingUser.id, profile.id]
            );
            // Link also verifies their email implicitly
            if (!existingUser.email_verified) {
              await pool.query(
                `UPDATE users SET email_verified = true WHERE id = $1`,
                [existingUser.id]
              );
              existingUser.email_verified = true;
            }
            return done(null, existingUser);
          }

         
          const { rows: [newUser] } = await pool.query<OAuthUser>(
            `INSERT INTO users (email, password_hash, email_verified, role, name)
             VALUES ($1, NULL, true, NULL, $2)
             RETURNING id, email, role, name, is_onboarded, email_verified`,
            [providerEmail, profile.displayName ?? ""]
          );

          if (!newUser) throw new Error('Failed to create account')

          await pool.query(
            `INSERT INTO oauth_accounts (user_id, provider, provider_id)
             VALUES ($1, 'google', $2)`,
            [newUser.id, profile.id]
          );

          return done(null, newUser);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}

export default passport;