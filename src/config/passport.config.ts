import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "./db.js";

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
          const { rows: [existingOAuth] } = await pool.query(
            `SELECT u.id, u.email, u.role, u.name, u.is_onboarded
             FROM oauth_accounts oa
             JOIN users u ON u.id = oa.user_id
             WHERE oa.provider = 'google' AND oa.provider_id = $1`,
            [profile.id]
          );

          if (existingOAuth) return done(null, existingOAuth);

          // 2. User exists with this email (signed up with password)?
          //    Link the OAuth account to them.
          const { rows: [existingUser] } = await pool.query(
            `SELECT id, email, role, name, is_onboarded
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
            return done(null, existingUser);
          }

          // 3. Brand new user — create account + link OAuth
          const { rows: [newUser] } = await pool.query(
            `INSERT INTO users (email, password_hash, email_verified, role, name)
             VALUES ($1, NULL, true, NULL, $2)
             RETURNING id, email, role, name, is_onboarded`,
            [providerEmail, profile.displayName ?? ""]
          );

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