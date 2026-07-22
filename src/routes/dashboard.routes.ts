import { Router } from "express";
import { dashboard, buyers, exportBuyers } from "../controllers/dashboard.controller.js";
import { authenticateToken, requireVerifiedEmail } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.get("/creator/dashboard", looseLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, dashboard);
router.get("/creator/buyers", looseLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, buyers);
router.get("/creator/buyers/export", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, exportBuyers);

export default router;