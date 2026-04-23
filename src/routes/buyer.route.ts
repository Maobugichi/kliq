import { Router } from "express";
import { getLibrary, resendDownload } from "../controllers/buyer.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();


router.get("/buyer/library", authenticateToken, getLibrary);
router.post("/buyer/library/:orderId/resend", authenticateToken, resendDownload);

export default router;