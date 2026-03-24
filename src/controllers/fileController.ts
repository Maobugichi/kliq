import type { Request, Response } from "express";
import {
  attachFileToProduct,
  getProductFiles,
  deleteProductFile,
} from "../services/productFile.service.js";
import type { UploadableFile } from "../utils/cloudinary.util.js";
import pool from "../config/db.js";

// POST /products/:productId/files
// Multer puts the uploaded file on req.file
export const uploadFile = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;
    const creatorId = req.user!.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Verify the product belongs to this creator
    const { rows: [product] } = await pool.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND creator_id = $2 AND status != 'deleted'`,
      [productId, creatorId]
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized",
      });
    }

    const file = await attachFileToProduct(productId, req.file as UploadableFile);

    return res.status(201).json({ success: true, data: file });
  } catch (err) {
    console.error("uploadFile error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// GET /products/:productId/files
export const listFiles = async (req: Request, res: Response) => {
  try {
   const productId = req.params["productId"] as string;
    const creatorId = req.user!.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    // Verify ownership
    const { rows: [product] } = await pool.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND creator_id = $2`,
      [productId, creatorId]
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized",
      });
    }

    const files = await getProductFiles(productId);

    return res.status(200).json({ success: true, data: files });
  } catch (err) {
    console.error("listFiles error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// DELETE /products/:productId/files/:fileId
export const removeFile = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;
    const fileId = req.params["fileId"] as string;
    const creatorId = req.user!.id;

    if (!productId || !fileId) {
      return res.status(400).json({
        success: false,
        message: "productId and fileId are required",
      });
    }

    // Verify ownership
    const { rows: [product] } = await pool.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND creator_id = $2`,
      [productId, creatorId]
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized",
      });
    }

    await deleteProductFile(fileId, productId);

    return res.status(200).json({ success: true, message: "File deleted" });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "File not found or does not belong to this product"
    )
      return res.status(404).json({ success: false, message: err.message });
    console.error("removeFile error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};