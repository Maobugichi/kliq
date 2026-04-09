import { Router } from "express";
import type { Request, Response } from "express";
import {
  signup,
  login,
  logout,
  logoutAllController,
  refreshToken,
} from "../controllers/auth.controller.js";
import { sendEmailVerification, verifyEmailToken } from "../services/emailVerification.service.js";
import { requestPasswordReset, resetPassword } from "../services/passwordReset.service.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.post("/auth/logout-all", authenticateToken, logoutAllController);
router.post("/auth/refresh", refreshToken);


router.post("/auth/verify-email/send", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id, email } = req.user!;
    await sendEmailVerification(id, email);
    return res.status(200).json({ success: true, message: "Verification email sent" });
  } catch (err) {
    console.error("sendEmailVerification error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.post("/auth/verify-email/confirm", async (req: Request, res: Response) => {
  try {
    const token = req.body.token as string | undefined;
    if (!token) return res.status(400).json({ success: false, message: "token is required" });

    await verifyEmailToken(token);
    return res.status(200).json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid or expired verification token")
      return res.status(400).json({ success: false, message: err.message });
    console.error("verifyEmailToken error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  try {
    const email = req.body.email as string | undefined;
    if (!email) return res.status(400).json({ success: false, message: "email is required" });

    await requestPasswordReset(email);
    return res.status(200).json({ success: true, message: "If that email exists, a reset link has been sent" });
  } catch (err) {
    console.error("requestPasswordReset error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const token = req.body.token as string | undefined;
    const new_password = req.body.new_password as string | undefined;

    if (!token || !new_password)
      return res.status(400).json({ success: false, message: "token and new_password are required" });

    if (new_password.length < 8)
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });

    await resetPassword(token, new_password);
    return res.status(200).json({ success: true, message: "Password reset successful — please log in with your new password" });
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid or expired reset token")
      return res.status(400).json({ success: false, message: err.message });
    console.error("resetPassword error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

export default router;