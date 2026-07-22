import { Router } from "express";
import {
  applyAsCreator,
  updateMyProfile,
  getStorefront,
  getMyProfile,
  checkSlug,
  uploadCreatorImage,
  getBuyers,
  sendBuyerEmail,
  upgradeToCreator
} from "../controllers/creator.controller.js";
import type { RequestHandler } from "express";
import { authenticateToken, requireVerifiedEmail } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { uploadThumbnail } from "../middleware/upload.middleware.js";
import { strictLimiter, defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

const [thumbnailParser, thumbnailUploader] = uploadThumbnail as [RequestHandler, RequestHandler];

router.get("/store/:slug", looseLimiter, getStorefront);

router.post("/creator/upgrade-to-creator", defaultLimiter, authenticateToken, upgradeToCreator);

router.get("/creator/me", looseLimiter, authenticateToken, requireActiveCreator, getMyProfile);
router.get("/creator/check-slug", defaultLimiter, authenticateToken, requireActiveCreator, checkSlug);

router.post("/creator/apply", strictLimiter, authenticateToken, applyAsCreator);
router.patch("/creator/me", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, updateMyProfile);

router.get('/creator/buyers', looseLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, getBuyers);

router.post(
  "/creator/buyers/email",
  strictLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  sendBuyerEmail
);
router.post("/creator/upload-image", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, thumbnailParser, thumbnailUploader, uploadCreatorImage);

export default router;