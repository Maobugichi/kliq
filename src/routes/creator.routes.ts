import { Router } from "express";
import {
  applyAsCreator,
  updateMyProfile,
  getStorefront,
  getMyProfile,
  checkSlug,
  uploadCreatorImage,
  getBuyers
} from "../controllers/creator.controller.js";
import type { RequestHandler } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { uploadThumbnail } from "../middleware/upload.middleware.js";

const router = Router();

const [thumbnailParser, thumbnailUploader] = uploadThumbnail as [RequestHandler, RequestHandler];

router.get("/store/:slug", getStorefront);

router.get("/creator/me", authenticateToken, requireActiveCreator, getMyProfile);
router.get("/creator/check-slug", authenticateToken, requireActiveCreator, checkSlug);

router.post("/creator/apply", authenticateToken, applyAsCreator);
router.patch("/creator/me", authenticateToken, requireActiveCreator, updateMyProfile);
// creator.routes.ts
router.get('/creator/buyers', authenticateToken,requireActiveCreator, getBuyers);
router.post("/creator/upload-image", authenticateToken, requireActiveCreator, thumbnailParser, thumbnailUploader, uploadCreatorImage);

export default router;