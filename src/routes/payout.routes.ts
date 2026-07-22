import { Router } from "express";
import {
  listBanks,
  resolveAccount,
  getBalance,
  myPayouts,
  requestPayoutController,
  listAllPayouts,
  processPayoutController,
  listPayoutEvents,
  approvePayoutController,
} from "../controllers/payout.controller.js";
import { authenticateToken, authorizeRole, requireVerifiedEmail } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { strictLimiter, defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.get("/payouts/banks", looseLimiter, listBanks);
router.get("/payouts/resolve", strictLimiter, resolveAccount);

// Creator routes — authenticated + active creator
router.get("/payouts/balance", looseLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, getBalance);
router.get("/payouts/me", looseLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, myPayouts);
router.post("/payouts/request", strictLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, requestPayoutController);

// Admin routes
router.get("/admin/payouts", looseLimiter, authenticateToken, authorizeRole("admin"), listAllPayouts);
router.get("/admin/payouts/:payoutId/events", looseLimiter, authenticateToken, authorizeRole("admin"), listPayoutEvents);
router.post("/admin/payouts/:payoutId/approve", defaultLimiter, authenticateToken, authorizeRole("admin"), approvePayoutController);
router.post("/admin/payouts/:payoutId/process", defaultLimiter, authenticateToken, authorizeRole("admin"), processPayoutController);

export default router;