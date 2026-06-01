import { Router } from "express";
import { initiate, verify, webhook } from "../controllers/payment.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/payments/webhook",
  webhook
);


router.post("/payments/initiate", authenticateToken, initiate);

// payment.route.ts
router.get("/payments/verify/:reference", authenticateToken, verify);

export default router;

