import { Router } from "express";
import {
  applyAsCreator,
  updateMyProfile,
  getStorefront,
  getMyProfile,
  checkSlug,
  uploadCreatorImage,
} from "../controllers/creator.controller.js";
import type { RequestHandler } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";
import { uploadThumbnail } from "../middleware/upload.middleware.js";

const router = Router();


router.get("/store/:slug", getStorefront);

router.post("/creator/apply", authenticateToken, applyAsCreator);

router.patch("/creator/me", authenticateToken, requireActiveCreator, updateMyProfile);

const [thumbnailParser, thumbnailUploader] = uploadThumbnail as [RequestHandler, RequestHandler];

router.get("/store/:slug", getStorefront);

router.get("/creator/me", authenticateToken, requireActiveCreator, getMyProfile);
router.get("/creator/check-slug", authenticateToken, requireActiveCreator, checkSlug);

router.post("/creator/apply", authenticateToken, applyAsCreator);
router.patch("/creator/me", authenticateToken, requireActiveCreator, updateMyProfile);

// image upload — reuses the same multer+cloudinary middleware, just a different folder target
// note: uploadThumbnail currently hardcodes "kliq/thumbnails" folder; that's fine for profile/banner images too
// or you can duplicate the middleware with folder "kliq/creator-images" if you want them separated
router.post("/creator/upload-image", authenticateToken, requireActiveCreator, thumbnailParser, thumbnailUploader, uploadCreatorImage);

export default router;