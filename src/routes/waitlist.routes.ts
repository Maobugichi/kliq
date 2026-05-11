import { Router } from "express";
import { join, count, list, joinWaitlistSchema, emailWebhook } from "../controllers/waitlist.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";
import { createRateLimiter, strictLimiter } from "../utils/ratelimiter.js";
import { validateBody } from "../utils/validate.js";

const router = Router();


router.post(
    "/waitlist",
    strictLimiter,             
   validateBody(joinWaitlistSchema),
   join);
router.get("/waitlist/count", count);


router.get("/admin/waitlist", authenticateToken, authorizeRole("admin"), list);

router.post(
  "/webhooks/email",
  createRateLimiter({ max: 100, windowMinutes: 1 }),
  emailWebhook
);

export default router;
