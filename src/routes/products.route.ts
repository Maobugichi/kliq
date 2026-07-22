import { Router } from "express";
import {
  create,
  listMine,
  getOne,
  update,
  publish,
  unpublish,
  remove,
  listPublished,
} from "../controllers/product.controller.js";
import {
  uploadFile,
  listFiles,
  removeFile,
} from "../controllers/fileController.js";
import { authenticateToken, authenticateOptional, requireVerifiedEmail } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { upload, uploadThumbnail } from "../middleware/upload.middleware.js";
import { strictLimiter, defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";

const router = Router();

import type { RequestHandler } from "express";

const [thumbnailParser, thumbnailUploader] = uploadThumbnail as [RequestHandler, RequestHandler];

router.get('/products', looseLimiter, listPublished);

router.get("/products/me", looseLimiter, authenticateToken, requireActiveCreator, listMine);
router.get("/products/:productId", looseLimiter, authenticateOptional, getOne);

router.post("/products", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, create);
router.patch(
  "/products/:productId",
  defaultLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  thumbnailParser,
  thumbnailUploader,
  update
);
router.post("/products/:productId/publish", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, publish);
router.post("/products/:productId/unpublish", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, unpublish);
router.delete("/products/:productId", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, remove);

// ─── File uploads ─────────────────────────────────────────────────────────────
router.post(
  "/products/:productId/files",
  strictLimiter,
  authenticateToken,
  requireActiveCreator,
  requireVerifiedEmail,
  upload.single("file"),
  uploadFile
);
router.get("/products/:productId/files", looseLimiter, authenticateToken, requireActiveCreator, listFiles);
router.delete("/products/:productId/files/:fileId", defaultLimiter, authenticateToken, requireActiveCreator, requireVerifiedEmail, removeFile);

export default router;