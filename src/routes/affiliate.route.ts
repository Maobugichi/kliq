import { Router } from "express";
import { invite, list, myStats, remove, resendInvite, toggle, updateCommission } from "../controllers/affiliate.controller.js";
import { authenticateToken, requireVerifiedEmail } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { strictLimiter, defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.get("/affiliates/me", looseLimiter, authenticateToken, myStats);

router.post(
  "/affiliates",
  strictLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  invite
);
router.get(
  "/affiliates",
  looseLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  list
);
router.patch(
  "/affiliates/:affiliateId/toggle",
  defaultLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  toggle
);

router.post(
  "/affiliates/:affiliateId/resend-invite",
  strictLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  resendInvite
);

router.patch(
  "/affiliates/:affiliateId/commission",
  defaultLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  updateCommission
);

router.delete(
  "/affiliates/:affiliateId",
  defaultLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  remove
);
 

export default router;

