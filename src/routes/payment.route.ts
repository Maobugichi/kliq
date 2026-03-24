import { Router } from "express";
import { initiate, webhook } from "../controllers/payment.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();


router.post(
  "/payments/webhook",
  webhook
);


router.post("/payments/initiate", authenticateToken, initiate);

export default router;