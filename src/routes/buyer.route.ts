import { Router } from "express";
import { getLibrary, getProfile, resendDownload, updateProfile, verifyMagicLink } from "../controllers/buyer.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { strictLimiter, defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.get("/buyer/library/magic", strictLimiter, verifyMagicLink);

router.get("/buyer/library", looseLimiter, authenticateToken, getLibrary);
router.post("/buyer/library/:orderId/resend", strictLimiter, authenticateToken, resendDownload);

router.get("/buyer/profile", looseLimiter, authenticateToken, getProfile);
router.patch("/buyer/profile", defaultLimiter, authenticateToken, updateProfile);

export default router;