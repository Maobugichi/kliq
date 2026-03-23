import { Router } from "express";
import { downloadFile } from "../controllers/download.controller.js";

const router = Router();

router.get("/download/:token", downloadFile);

export default router;