import { Router } from "express";
import { list, unreadCount, read, readAll } from "../controllers/notification.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();


router.use(authenticateToken);

router.get("/notifications/unread-count", unreadCount);
router.patch("/notifications/read-all", readAll);
router.get("/notifications", list);
router.patch("/notifications/:notificationId/read", read);

export default router;