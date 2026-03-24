import type { Request, Response } from "express";
import {
  getAllCreators,
  approveCreator,
  rejectCreator,
  suspendCreator,
  revokeOrder,
} from "../services/admin.service.js";


export const listCreators = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const creators = await getAllCreators(status as string | undefined);

    return res.status(200).json({
      success: true,
      count: creators.length,
      data: creators,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid status")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error("listCreators error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const approveCreatorController = async (req: Request, res: Response) => {
  try {
    const userId = req.params["userId"] as string;

    if (!userId) {
        return res.status(400).json({success:false, message:'userId required'})
    }

    const updated = await approveCreator(userId);

    return res.status(200).json({
      success: true,
      message: "Creator approved",
      data: updated,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Creator not found")
        return res.status(404).json({ success: false, message: err.message });
      if (err.message.startsWith("Creator is not pending"))
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error("approveCreator error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /admin/creators/:userId/reject
export const rejectCreatorController = async (req: Request, res: Response) => {
  try {
    const userId = req.params["userId"] as string;
    const { reason } = req.body as { reason?: string };

    if (!reason) {
      return res.status(400).json({ success: false, message: "Rejection reason is required" });
    }

    const updated = await rejectCreator(userId, reason);

    return res.status(200).json({
      success: true,
      message: "Creator rejected",
      data: updated,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Creator not found")
      return res.status(404).json({ success: false, message: err.message });
    console.error("rejectCreator error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /admin/creators/:userId/suspend
export const suspendCreatorController = async (req: Request, res: Response) => {
  try {
    const userId = req.params["userId"] as string;
    const { reason } = req.body as { reason?: string };

    if (!reason) {
      return res.status(400).json({ success: false, message: "Suspension reason is required" });
    }

    const updated = await suspendCreator(userId, reason);

    return res.status(200).json({
      success: true,
      message: "Creator suspended",
      data: updated,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Creator not found")
        return res.status(404).json({ success: false, message: err.message });
      if (err.message === "Creator is already suspended")
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error("suspendCreator error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /admin/orders/:orderId/revoke
export const revokeOrderController = async (req: Request, res: Response) => {
  try {
    const orderId = req.params["orderId"] as string;
    await revokeOrder(orderId);

    return res.status(200).json({
      success: true,
      message: "Order refunded and access revoked",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Order not found or not in paid status")
      return res.status(404).json({ success: false, message: err.message });
    console.error("revokeOrder error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};