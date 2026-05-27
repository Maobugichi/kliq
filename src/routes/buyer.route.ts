import { Router } from "express";
import { getLibrary, getProfile, resendDownload, updateProfile } from "../controllers/buyer.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();


router.get("/buyer/library", authenticateToken, getLibrary);
router.post("/buyer/library/:orderId/resend", authenticateToken, resendDownload);

router.get("/buyer/profile", authenticateToken, getProfile);
router.patch("/buyer/profile", authenticateToken, updateProfile);

export default router;