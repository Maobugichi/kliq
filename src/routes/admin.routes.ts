import { Router } from "express";
import {
  listCreators,
  approveCreatorController,
  rejectCreatorController,
  suspendCreatorController,
  revokeOrderController,
} from "../controllers/admin.controller.js";
import {
  listFlagged,
  flag,
  unflag,
  forceDelete,
} from "../controllers/moderation.controller.js";
import { listConfig, updatePlatformFee } from "../controllers/config.controller.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticateToken, authorizeRole("admin"));

// ─── Creator KYC ─────────────────────────────────────────────────────────────
router.get("/admin/creators", listCreators);
router.post("/admin/creators/:userId/approve", approveCreatorController);
router.post("/admin/creators/:userId/reject", rejectCreatorController);
router.post("/admin/creators/:userId/suspend", suspendCreatorController);

// ─── Order management ─────────────────────────────────────────────────────────
router.post("/admin/orders/:orderId/revoke", revokeOrderController);

// ─── Content moderation ───────────────────────────────────────────────────────
router.get("/admin/products/flagged", listFlagged);
router.post("/admin/products/:productId/flag", flag);
router.post("/admin/products/:productId/unflag", unflag);
router.delete("/admin/products/:productId", forceDelete);

// ─── Platform config ──────────────────────────────────────────────────────────
router.get("/admin/config", listConfig);
router.patch("/admin/config/platform-fee", updatePlatformFee);

export default router;