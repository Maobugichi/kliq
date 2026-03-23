import { Router } from "express";
import {
  applyAsCreator,
  updateMyProfile,
  getStorefront,
} from "../controllers/creator.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";

const router = Router();


router.get("/store/:slug", getStorefront);

router.post("/creator/apply", authenticateToken, applyAsCreator);

router.patch("/creator/me", authenticateToken, requireActiveCreator, updateMyProfile);

export default router;