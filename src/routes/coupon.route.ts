import { Router } from "express";
import { create, list, remove, toggle, apply } from "../controllers/coupon.controller.js";
import { authenticateToken, requireVerifiedEmail } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { strictLimiter, defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.post("/coupons/apply", strictLimiter, apply);

router.post(
  "/coupons",
  defaultLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  create
);
router.get(
  "/coupons",
  looseLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  list
);
router.delete(
  "/coupons/:couponId",
  defaultLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  remove
);
router.patch(
  "/coupons/:couponId/toggle",
  defaultLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  toggle
);

export default router;