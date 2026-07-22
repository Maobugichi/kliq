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
  type PublishedProductSortOption,
  listPublishedProducts,
  type ListPublishedProductsInput,
} from "../services/product.service.js";
import { findCreatorByUserId } from "../services/creator.service.js";


async function getCreatorProfile(userId: string, res: Response) {
  const profile = await findCreatorByUserId(userId);
  
  if (!profile) {
    res.status(403).json({ success: false, message: "Creator profile not found" });
    return null;
  }
  return profile;
}

export const create = async (req: Request, res: Response) => {
  try {
    const profile = await getCreatorProfile(req.user!.id, res);
    if (!profile) return;

    const { title, description, price_cents, thumbnail, category } = req.body as Omit<
      CreateProductInput,
      "creator_id"
    >;

    if (!title || price_cents === undefined) {
      return res.status(400).json({
        success: false,
        message: "title and price_cents are required",
      });
    }

    const validCategories = ["ebook", "course", "template", "design", "music", "video", "other"];
    if (category !== undefined && !validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
      });
    }

    const product = await createProduct({
      creator_id: profile.id,
      title,
      price_cents,
      ...(description !== undefined && { description }),
      ...(thumbnail !== undefined && { thumbnail }),
      ...(category !== undefined && { category }),
    });

    return res.status(201).json({ success: true, data: product });
  } catch (err) {
    console.error("createProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const listMine = async (req: Request, res: Response) => {
  try {
    const profile = await getCreatorProfile(req.user!.id, res);
    if (!profile) return;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;

    const result = await listOwnProducts(profile.id, page, limit);

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("listMine error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getOne = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const product = await getProductById(productId, true);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Non-owners can only see published products
    // product.creator_id is creator_profiles.id — resolve requester's profile.id to compare
    if (product.status !== "published") {
      if (!req.user) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
      const profile = await findCreatorByUserId(req.user.id);
      if (!profile || profile.id !== product.creator_id) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
    }

    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    console.error("getOne error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const profile = await getCreatorProfile(req.user!.id, res);
    if (!profile) return;

    const updates: UpdateProductInput = { ...req.body };

    
    if (req.file) {
      updates.thumbnail = req.file.path; 
    }

    const validCategories = ["ebook", "course", "template", "design", "music", "video", "other"];
    if (updates.category !== undefined && !validCategories.includes(updates.category)) {
      return res.status(400).json({ success: false, message: "Invalid category" });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields to update" });
    }

    const product = await updateProduct(productId, profile.id, updates);

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

export const publish = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    
    const profile = await getCreatorProfile(req.user!.id, res);
    if (!profile) return;

    const product = await publishProduct(productId, profile.id);

    

    return res.status(200).json({ success: true, message: "Product published", data: product });
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

export const unpublish = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const profile = await getCreatorProfile(req.user!.id, res);
    if (!profile) return;

    const product = await unpublishProduct(productId, profile.id);

    return res.status(200).json({ success: true, message: "Product unpublished", data: product });
  } catch (err) {
    if (err instanceof Error && err.message === "Product not found or cannot be unpublished")
      return res.status(404).json({ success: false, message: err.message });
    console.error("unpublishProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const productId = req.params["productId"] as string;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const profile = await getCreatorProfile(req.user!.id, res);
    if (!profile) return;

    await deleteProduct(productId, profile.id);

    return res.status(200).json({ success: true, message: "Product deleted" });
  } catch (err) {
    if (err instanceof Error && err.message === "Product not found or unauthorized")
      return res.status(404).json({ success: false, message: err.message });
    console.error("deleteProduct error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


export const listPublished = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, sort, page, category } = req.query as {
      search?: string;
      sort?: string;
      page?: string;
      category?:string
    };
 
    // ── Validate sort param ───────────────────────────────────────────────
    const validSortValues: PublishedProductSortOption[] = ['latest', 'popular'];
    const resolvedSort: PublishedProductSortOption =
      sort !== undefined && validSortValues.includes(sort as PublishedProductSortOption)
        ? (sort as PublishedProductSortOption)
        : 'latest';
 
   const validCategories = ["ebook", "course", "template", "design", "music", "video", "other"];
    const resolvedCategory =
      category !== undefined && validCategories.includes(category)
        ? (category as ListPublishedProductsInput["category"])
        : undefined;

    const parsedPage = page !== undefined ? parseInt(page, 10) : 1;
    const resolvedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
 
   
    const input: ListPublishedProductsInput = {
      sort: resolvedSort,
      page: resolvedPage,
    };
    
    if (search !== undefined && search.trim().length > 0) {
      input.search = search.trim();
    }

     if (resolvedCategory !== undefined) {
      input.category = resolvedCategory;
    }
 
    const result = await listPublishedProducts(input);
 
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('listPublished error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};