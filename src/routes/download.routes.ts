import { Router } from "express";
import { downloadFile } from "../controllers/download.controller.js";
import { strictLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.get("/download/:token", strictLimiter, downloadFile);

export default router;