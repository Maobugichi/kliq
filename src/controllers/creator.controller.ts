import type { Request, Response } from "express";
import {
  createCreatorProfile,
  updateCreatorProfile,
  findCreatorBySlug,
  findCreatorByUserId,
  isSlugAvailable,
  getBuyersForCreator,
  sendEmailToBuyers,
  upgradeToCreatorService
} from "../services/creator.service.js";
import { listProductsByCreator } from "../services/product.service.js";
import type { UpdateCreatorProfileInput } from "../types/creator.types.js";
import type { BuyerEmailTemplate } from "../types/email.types.js";
import { ACCESS_COOKIE_OPTIONS } from "../utils/cookie.js";



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
    const slug = req.params["slug"] as string;

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

    const products = await listProductsByCreator(profile.id, page, limit);

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



export const getBuyers = async (req: Request, res: Response) => {
  try {
    const buyers = await getBuyersForCreator(req.user!.id);
    return res.status(200).json({ buyers });
  } catch (err) {
    console.error('getBuyers error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const profile = await findCreatorByUserId(req.user!.id);
    if (!profile) {
      return res.status(404).json({ success: false, message: "Creator profile not found" });
    }
    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    console.error("getMyProfile error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const checkSlug = async (req: Request, res: Response) => {
  try {
    const slug = req.query.slug as string;
    if (!slug) {
      return res.status(400).json({ success: false, message: "slug is required" });
    }

    const available = await isSlugAvailable(slug);
    if (!available) {
      return res.status(409).json({ success: false, message: "Slug is already taken" });
    }

    return res.status(200).json({ success: true, message: "Slug is available" });
  } catch (err) {
    console.error("checkSlug error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const uploadCreatorImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // uploadThumbnail middleware already streamed the file to Cloudinary
    // and put the secure_url on req.file.path
    return res.status(200).json({ url: req.file.path });
  } catch (err) {
    console.error("uploadCreatorImage error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};



const VALID_TEMPLATES: BuyerEmailTemplate[] = [
  "thank_you",
  "reengagement",
  "discount",
  "new_product",
  "custom",
];

export const sendBuyerEmail = async (req: Request, res: Response) => {
  try {
    const {
      buyerIds,
      template,
      subject,
      body,
      couponCode,
      productTitle,
      productUrl,
    } = req.body;

    // ─── Validation ───────────────────────────────────────────────────────────

    if (!Array.isArray(buyerIds) || buyerIds.length === 0) {
      return res.status(400).json({ success: false, message: "buyerIds must be a non-empty array" });
    }

    if (buyerIds.length > 500) {
      return res.status(400).json({ success: false, message: "Cannot send to more than 500 buyers at once" });
    }

    if (!template || !VALID_TEMPLATES.includes(template)) {
      return res.status(400).json({
        success: false,
        message: `template must be one of: ${VALID_TEMPLATES.join(", ")}`,
      });
    }

    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      return res.status(400).json({ success: false, message: "subject is required" });
    }

    if (subject.trim().length > 150) {
      return res.status(400).json({ success: false, message: "subject must be 150 characters or fewer" });
    }

    if (!body || typeof body !== "string" || body.trim().length === 0) {
      return res.status(400).json({ success: false, message: "body is required" });
    }

    if (body.trim().length > 5000) {
      return res.status(400).json({ success: false, message: "body must be 5000 characters or fewer" });
    }

    // ─── Delegate to service ──────────────────────────────────────────────────

    const result = await sendEmailToBuyers(req.user!.id, {
      buyerIds,
      template,
      subject: subject.trim(),
      body: body.trim(),
      ...(couponCode   && { couponCode }),
      ...(productTitle && { productTitle }),
      ...(productUrl   && { productUrl }),
    });

    return res.status(200).json({
      success: true,
      message: `Email queued for ${result.queued} buyer${result.queued !== 1 ? "s" : ""}`,
      queued: result.queued,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    console.error("[sendBuyerEmail] error:", err);
    return res.status(500).json({ success: false, message });
  }
};

// auth.controller.ts — new export

export const upgradeToCreator = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { storeSlug } = req.body;
    const result = await upgradeToCreatorService(userId, { storeSlug });

    res.cookie("accessToken", result.accessToken, ACCESS_COOKIE_OPTIONS);

    return res.status(200).json({ user: result.user });
  } catch (err: any) {
    if (err.message === "Slug already taken" || err.message === "Already a creator" || err.message === "Store slug is required") {
      return res.status(409).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};