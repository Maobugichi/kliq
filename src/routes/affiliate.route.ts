import { Router } from "express";
import { invite, list, myStats, toggle } from "../controllers/affiliate.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireActiveCreator } from "../middleware/creator.middleware.js";

const router = Router();


router.get("/affiliates/me", authenticateToken, myStats);


router.post("/affiliates", authenticateToken, requireActiveCreator, invite);
router.get("/affiliates", authenticateToken, requireActiveCreator, list);
router.patch("/affiliates/:affiliateId/toggle", authenticateToken, requireActiveCreator, toggle);

export default router;