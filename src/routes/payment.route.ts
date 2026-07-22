import { Router } from "express";
import { initiate, verify, webhook } from "../controllers/payment.controller.js";
import { authenticateOptional, authenticateToken } from "../middleware/auth.middleware.js";
import { strictLimiter, defaultLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.post(
  "/payments/webhook",
  webhook
);

router.post("/payments/initiate", strictLimiter, authenticateOptional, initiate);

// payment.route.ts
router.get("/payments/verify/:reference", defaultLimiter, verify);

export default router;