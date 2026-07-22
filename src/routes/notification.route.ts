import { Router } from "express";
import { list, unreadCount, read, readAll } from "../controllers/notification.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { defaultLimiter, looseLimiter } from "../utils/ratelimiter.js";
import { authorizeRole } from "../middleware/auth.middleware.js";
import { broadcast } from "../controllers/notification.controller.js";
import { strictLimiter } from "../utils/ratelimiter.js";

const router = Router();

router.use(authenticateToken);

router.get("/notifications/unread-count", looseLimiter, unreadCount);
router.patch("/notifications/read-all", defaultLimiter, readAll);
router.get("/notifications", looseLimiter, list);
router.patch("/notifications/:notificationId/read", defaultLimiter, read);


router.post("/admin/notifications/broadcast", strictLimiter, authorizeRole("admin"), broadcast);

export default router;