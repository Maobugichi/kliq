import { Router } from "express";
import { create, list, remove, toggle, apply } from "../controllers/coupon.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";

const router = Router();

// Public — buyer applies coupon at checkout
router.post("/coupons/apply", apply);

// Creator — authenticated + active
router.post("/coupons", authenticateToken, requireActiveCreator, create);
router.get("/coupons", authenticateToken, requireActiveCreator, list);
router.delete("/coupons/:couponId", authenticateToken, requireActiveCreator, remove);
router.patch("/coupons/:couponId/toggle", authenticateToken, requireActiveCreator, toggle);

export default router;