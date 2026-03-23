import type { Request, Response } from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  publishProduct,
  unpublishProduct,
  getProductById,
  listOwnProducts,
  type CreateProductInput,
  type UpdateProductInput,
} from "../services/product.service.js";

// POST /products
export const create = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const { title, description, price_cents, thumbnail } = req.body as Omit<
      CreateProductInput,
      "creator_id"
    >;

    if (!title || price_cents === undefined) {
      return res.status(400).json({
        success: false,
        message: "title and price_cents are required",
      });
    }

    const product = await createProduct({
      creator_id: creatorId,
      title,
      description,
      price_cents,
      thumbnail,
    });

    return res.status(201).json({ success: true, data: product });
  } catch (err) {
    console.error("createProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /products/me — creator's own products (all statuses)
export const listMine = async (req: Request, res: Response) => {
  try {
    const creatorId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;

    const result = await listOwnProducts(creatorId, page, limit);

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("listMine error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /products/:productId
export const getOne = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    // Include private (draft/unpublished) only if the requester is the owner
    const requesterId = req.user?.id;
    const product = await getProductById(productId, true);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Non-owners can only see published products
    if (product.status !== "published" && product.creator_id !== requesterId) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    console.error("getOne error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// PATCH /products/:productId
export const update = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const creatorId = req.user!.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const updates = req.body as UpdateProductInput;

    const product = await updateProduct(productId, creatorId, updates);

    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "No valid fields to update")
        return res.status(400).json({ success: false, message: err.message });
      if (err.message === "Product not found or unauthorized")
        return res.status(404).json({ success: false, message: err.message });
    }
    console.error("updateProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /products/:productId/publish
export const publish = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const creatorId = req.user!.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const product = await publishProduct(productId, creatorId);

    return res.status(200).json({
      success: true,
      message: "Product published",
      data: product,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "Creator profile not found",
        "Only active creators can publish products",
        "Complete payout onboarding before publishing",
        "Product not found or cannot be published",
      ];
      if (clientErrors.includes(err.message))
        return res.status(400).json({ success: false, message: err.message });
    }
    console.error("publishProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /products/:productId/unpublish
export const unpublish = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const creatorId = req.user!.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const product = await unpublishProduct(productId, creatorId);

    return res.status(200).json({
      success: true,
      message: "Product unpublished",
      data: product,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Product not found or cannot be unpublished")
      return res.status(404).json({ success: false, message: err.message });
    console.error("unpublishProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// DELETE /products/:productId
export const remove = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const creatorId = req.user!.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    await deleteProduct(productId, creatorId);

    return res.status(200).json({
      success: true,
      message: "Product deleted",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Product not found or unauthorized")
      return res.status(404).json({ success: false, message: err.message });
    console.error("deleteProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};