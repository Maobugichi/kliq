import type { Request, Response } from "express";
import {
  createCreatorProfile,
  updateCreatorProfile,
  findCreatorBySlug,
} from "../services/creator.service.js";
import { listProductsByCreator } from "../services/product.service.js";
import type { UpdateCreatorProfileInput } from "../types.ts/creator.types.js";


export const applyAsCreator = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { display_name, store_slug } = req.body as {
      display_name: string;
      store_slug: string;
    };

    if (!display_name || !store_slug) {
      return res.status(400).json({
        success: false,
        message: "display_name and store_slug are required",
      });
    }

    // Sanitise slug — lowercase, hyphens only
    const sanitisedSlug = store_slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-");

    const profile = await createCreatorProfile(userId, display_name, sanitisedSlug);

    return res.status(201).json({
      success: true,
      message: "Creator application submitted. Pending admin approval.",
      data: profile,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Store slug is already taken") {
      return res.status(409).json({ success: false, message: err.message });
    }

    console.error("applyAsCreator error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const updates = req.body as UpdateCreatorProfileInput;

    const profile = await updateCreatorProfile(userId, updates);

    return res.status(200).json({
      success: true,
      message: "Profile updated",
      data: profile,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "No valid fields to update") {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (err instanceof Error && err.message === "Creator profile not found") {
      return res.status(404).json({ success: false, message: err.message });
    }

    console.error("updateMyProfile error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const getStorefront = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    if (!slug) {
        return res.status(400).json({ success: false, message: "Store slug is required" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;

    
    const profile = await findCreatorBySlug(slug);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    const products = await listProductsByCreator(profile.user_id, page, limit);

    return res.status(200).json({
      success: true,
      data: {
        profile,
        ...products,
      },
    });
  } catch (err) {
    console.error("getStorefront error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};