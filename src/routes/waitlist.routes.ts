import { Router } from "express";
import { join, count, list } from "../controllers/waitlist.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();


router.post("/waitlist", join);
router.get("/waitlist/count", count);


router.get("/admin/waitlist", authenticateToken, authorizeRole("admin"), list);

export default router;