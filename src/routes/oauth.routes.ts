import { Router } from "express";
import passport from "../config/passport.config.js";
import { generateAccessToken, generateRefreshToken } from "../utils/token.util.js";
import { cookieOptions } from "../utils/cookie.js"; // your existing helper

const router = Router();

const CLIENT_URL = process.env.FRONTEND_URL as string;

// ── Initiate ──────────────────────────────────────────────────────────────────

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

// ── Callback ──────────────────────────────────────────────────────────────────

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${CLIENT_URL}/login?error=oauth_failed` }),
  async (req, res) => {
    try {
      const user = req.user as {
        id: string;
        email: string;
        role: string | null;
        name: string | null;
        is_onboarded: boolean;
      };

      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        ...(user.role && { role: user.role as "creator" | "buyer" | "admin" }),
        });
      const refreshToken = await generateRefreshToken(user.id);

      res.cookie("accessToken", accessToken, cookieOptions("access"));
      res.cookie("refreshToken", refreshToken, cookieOptions("refresh"));

      // Not onboarded yet → same onboarding flow as email signup
      if (!user.is_onboarded) {
        return res.redirect(`${CLIENT_URL}/onboarding`);
      }

      const dest = user.role === "buyer" ? "/discover" : "/dashboard";
      return res.redirect(`${CLIENT_URL}${dest}`);
    } catch (err) {
      return res.redirect(`${CLIENT_URL}/login?error=oauth_failed`);
    }
  }
);

export default router;