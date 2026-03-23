import type { Request, Response } from "express";
import {
  flagProduct,
  unflagProduct,
  forceDeleteProduct,
  getFlaggedProducts,
} from "../services/moderation.service.js";

// GET /admin/products/flagged
export const listFlagged = async (req: Request, res: Response) => {
  try {
    const products = await getFlaggedProducts();
    return res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (err) {
    console.error("listFlagged error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const flag = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const adminId = req.user!.id;
    const { reason } = req.body as { reason?: string };

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    if (!reason) {
      return res.status(400).json({ success: false, message: "reason is required" });
    }

    const product = await flagProduct(productId, adminId, reason);

    return res.status(200).json({
      success: true,
      message: "Product flagged",
      data: product,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Product not found or already deleted")
      return res.status(404).json({ success: false, message: err.message });
    console.error("flagProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /admin/products/:productId/unflag
export const unflag = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const product = await unflagProduct(productId);

    return res.status(200).json({
      success: true,
      message: "Product unflagged and restored to unpublished",
      data: product,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Product not found or not currently flagged")
      return res.status(404).json({ success: false, message: err.message });
    console.error("unflagProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// DELETE /admin/products/:productId
export const forceDelete = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    await forceDeleteProduct(productId);

    return res.status(200).json({
      success: true,
      message: "Product permanently removed",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Product not found or already deleted")
      return res.status(404).json({ success: false, message: err.message });
    console.error("forceDeleteProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};