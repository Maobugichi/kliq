import { Router } from "express";
import {
  listBanks,
  resolveAccount,
  getBalance,
  myPayouts,
  requestPayoutController,
  listAllPayouts,
  processPayoutController,
} from "../controllers/payout.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";

const router = Router();


router.get("/payouts/banks", listBanks);
router.get("/payouts/resolve", resolveAccount);

// Creator routes — authenticated + active creator
router.get("/payouts/balance", authenticateToken, requireActiveCreator, getBalance);
router.get("/payouts/me", authenticateToken, requireActiveCreator, myPayouts);
router.post("/payouts/request", authenticateToken, requireActiveCreator, requestPayoutController);

// Admin routes
router.get("/admin/payouts", authenticateToken, authorizeRole("admin"), listAllPayouts);
router.post("/admin/payouts/:payoutId/process", authenticateToken, authorizeRole("admin"), processPayoutController);

export default router;