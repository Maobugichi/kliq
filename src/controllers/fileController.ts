import type { Request, Response } from "express";
import {
  attachFileToProduct,
  getProductFiles,
  deleteProductFile,
} from "../services/productFile.service.js";
import type { UploadableFile } from "../utils/cloudinary.util.js";
import { findCreatorByUserId } from "../services/creator.service.js";
import pool from "../config/db.js";

// ─── Helper ───────────────────────────────────────────────────────────────────

async function resolveCreatorProfileId(userId: string, res: Response): Promise<string | null> {
  const profile = await findCreatorByUserId(userId);
  if (!profile) {
    res.status(403).json({ success: false, message: "Creator profile not found" });
    return null;
  }
  return profile.id;
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export const uploadFile = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const creatorProfileId = await resolveCreatorProfileId(req.user!.id, res);
    if (!creatorProfileId) return;

    const { rows: [product] } = await pool.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND creator_id = $2 AND status != 'deleted'`,
      [productId, creatorProfileId]
    );

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or unauthorized" });
    }

    const file = await attachFileToProduct(productId, req.file as UploadableFile);

    return res.status(201).json({ success: true, data: file });
  } catch (err) {
    console.error("uploadFile error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const listFiles = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const creatorProfileId = await resolveCreatorProfileId(req.user!.id, res);
    if (!creatorProfileId) return;

    const { rows: [product] } = await pool.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND creator_id = $2`,
      [productId, creatorProfileId]
    );

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or unauthorized" });
    }

    const files = await getProductFiles(productId);

    return res.status(200).json({ success: true, data: files });
  } catch (err) {
    console.error("listFiles error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const removeFile = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;
    const fileId = req.params["fileId"] as string;

    if (!productId || !fileId) {
      return res.status(400).json({ success: false, message: "productId and fileId are required" });
    }

    const creatorProfileId = await resolveCreatorProfileId(req.user!.id, res);
    if (!creatorProfileId) return;

    const { rows: [product] } = await pool.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND creator_id = $2`,
      [productId, creatorProfileId]
    );

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or unauthorized" });
    }

    await deleteProductFile(fileId, productId);

    return res.status(200).json({ success: true, message: "File deleted" });
  } catch (err) {
    if (err instanceof Error && err.message === "File not found or does not belong to this product")
      return res.status(404).json({ success: false, message: err.message });
    console.error("removeFile error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};