import { Router } from "express";
import {
  create,
  listMine,
  getOne,
  update,
  publish,
  unpublish,
  remove,
} from "../controllers/product.controller.js";
import {
  uploadFile,
  listFiles,
  removeFile,
} from "../controllers/fileController.js";
import { authenticateToken, authenticateOptional } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { upload, uploadThumbnail } from "../middleware/upload.middleware.js";

const router = Router();

import type { RequestHandler } from "express";

const [thumbnailParser, thumbnailUploader] = uploadThumbnail as [RequestHandler, RequestHandler];~


router.get("/products/me", authenticateToken, requireActiveCreator, listMine);
router.get("/products/:productId", authenticateOptional, getOne);

router.post("/products", authenticateToken, requireActiveCreator, create);
router.patch(
  "/products/:productId",
  authenticateToken,
  requireActiveCreator,
  thumbnailParser,
  thumbnailUploader,
  update
);
router.post("/products/:productId/publish", authenticateToken, requireActiveCreator, publish);
router.post("/products/:productId/unpublish", authenticateToken, requireActiveCreator, unpublish);
router.delete("/products/:productId", authenticateToken, requireActiveCreator, remove);

// ─── File uploads ─────────────────────────────────────────────────────────────
router.post(
  "/products/:productId/files",
  authenticateToken,
  requireActiveCreator,
  upload.single("file"),
  uploadFile
);
router.get("/products/:productId/files", authenticateToken, requireActiveCreator, listFiles);
router.delete("/products/:productId/files/:fileId", authenticateToken, requireActiveCreator, removeFile);

export default router;