import { Router } from "express";
import { dashboard, buyers, exportBuyers } from "../controllers/dashboard.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";

const router = Router();


router.get("/creator/dashboard", authenticateToken, requireActiveCreator, dashboard);
router.get("/creator/buyers", authenticateToken, requireActiveCreator, buyers);
router.get("/creator/buyers/export", authenticateToken, requireActiveCreator, exportBuyers);

export default router;