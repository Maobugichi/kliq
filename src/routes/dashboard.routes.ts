import { Router } from "express";
import { dashboard, buyers, exportBuyers } from "../controllers/dashboard.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";

const router = Router();

// All dashboard routes — authenticated + active creator
router.use(authenticateToken, requireActiveCreator);

router.get("/creator/dashboard", dashboard);
router.get("/creator/buyers", buyers);
router.get("/creator/buyers/export", exportBuyers);

export default router;