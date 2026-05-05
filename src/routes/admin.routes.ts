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

const adminGuard = [authenticateToken, authorizeRole("admin")];

// ─── Creator KYC ─────────────────────────────────────────────────────────────
router.get("/admin/creators", ...adminGuard, listCreators);
router.post("/admin/creators/:userId/approve", ...adminGuard, approveCreatorController);
router.post("/admin/creators/:userId/reject", ...adminGuard, rejectCreatorController);
router.post("/admin/creators/:userId/suspend", ...adminGuard, suspendCreatorController);

// ─── Order management ─────────────────────────────────────────────────────────
router.post("/admin/orders/:orderId/revoke", ...adminGuard, revokeOrderController);

// ─── Content moderation ───────────────────────────────────────────────────────
router.get("/admin/products/flagged", ...adminGuard, listFlagged);
router.post("/admin/products/:productId/flag", ...adminGuard, flag);
router.post("/admin/products/:productId/unflag", ...adminGuard, unflag);
router.delete("/admin/products/:productId", ...adminGuard, forceDelete);

// ─── Platform config ──────────────────────────────────────────────────────────
router.get("/admin/config", ...adminGuard, listConfig);
router.patch("/admin/config/platform-fee", ...adminGuard, updatePlatformFee);

export default router;