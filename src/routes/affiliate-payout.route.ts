import { Router } from "express";
import {
  myBalance,
  myPayouts,
  requestPayout,
  approvePayout,
  processPayout,
  adminListPayouts,
} from "../controllers/affiliate-payout.controller.js";
import { authenticateToken, requireVerifiedEmail, authorizeRole } from "../middleware/auth.middleware.js";
import { strictLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.get(
  "/affiliate-payouts/me/balance",
  looseLimiter,
  authenticateToken,
  myBalance
);

router.get(
  "/affiliate-payouts/me",
  looseLimiter,
  authenticateToken,
  myPayouts
);

router.post(
  "/affiliate-payouts/me/request",
  strictLimiter,
  authenticateToken,
  requireVerifiedEmail,
  requestPayout
);

router.post(
  "/admin/affiliate-payouts/:payoutId/approve",
  strictLimiter,
  authenticateToken,
  authorizeRole("admin"),
  approvePayout
);

router.post(
  "/admin/affiliate-payouts/:payoutId/process",
  strictLimiter,
  authenticateToken,
  authorizeRole("admin"),
  processPayout
);

router.get(
  "/admin/affiliate-payouts",
  looseLimiter,
  authenticateToken,
  authorizeRole("admin"),
  adminListPayouts
);

export default router;