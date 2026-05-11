import pool from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import type { ProductFile } from "./productFile.service.js";

export interface Product {
  id: string;
  creator_id: string;
  title: string;
  slug: string;
  description: string | null;
  price_cents: number;
  thumbnail: string | null;
  status: "draft" | "published" | "unpublished" | "deleted";
  created_at: Date;
  updated_at: Date;
}


export interface ProductWithFiles extends Product {
  files: ProductFile[];
}


export interface PaginatedProducts {
  products: ProductWithFiles[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type CreateProductInput = Pick<
  Product,
  "creator_id" | "title" | "price_cents"
> & {
  description?: string;
  thumbnail?: string;
};

export type UpdateProductInput = Partial<
  Pick<Product, "title" | "description" | "price_cents" | "thumbnail">
>;


const withFiles = async (product: Product): Promise<ProductWithFiles> => {
  const { rows: files } = await pool.query<ProductFile>(
    `SELECT * FROM product_files WHERE product_id = $1 ORDER BY created_at ASC`,
    [product.id]
  );
  return { ...product, files };
};



export const createProduct = async ({
  creator_id,
  title,
  description,
  price_cents,
  thumbnail,
}: CreateProductInput): Promise<Product> => {
  const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const slug = `${baseSlug}-${Date.now()}`;

  const { rows: [product] } = await pool.query<Product>(
    `INSERT INTO products
       (creator_id, title, description, price_cents, thumbnail, slug, status)
     VALUES ($1,$2,$3,$4,$5,$6,'draft')
     RETURNING *`,
    [creator_id, title, description ?? null, price_cents, thumbnail ?? null, slug]
  );

  if (!product) throw new Error("Failed to create product");
  return product;
};



export const getProductById = async (
  productId: string,
  includePrivate = false
): Promise<ProductWithFiles | null> => {
  const { rows: [product] } = await pool.query<Product>(
    `SELECT * FROM products
     WHERE id = $1
     ${includePrivate ? "AND status != 'deleted'" : "AND status = 'published'"}`,
    [productId]
  );

  if (!product) return null;
  return withFiles(product);
};


export const listProductsByCreator = async (
  creatorId: string,
  page = 1,
  limit = 12
): Promise<PaginatedProducts> => {
  const offset = (page - 1) * limit;

  const { rows: products } = await pool.query<Product>(
    `SELECT * FROM products
     WHERE creator_id = $1 AND status = 'published'
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [creatorId, limit, offset]
  );

  const { rows: [ countRow ] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM products
     WHERE creator_id = $1 AND status = 'published'`,
    [creatorId]
  );

  const total = parseInt(countRow?.count ?? "0", 10);
  const productsWithFiles = await Promise.all(products.map(withFiles));

  return {
    products: productsWithFiles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};


export const listOwnProducts = async (
  creatorId: string,
  page = 1,
  limit = 12
): Promise<PaginatedProducts> => {
  const offset = (page - 1) * limit;

  const { rows: products } = await pool.query<Product>(
    `SELECT * FROM products
     WHERE creator_id = $1 AND status != 'deleted'
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [creatorId, limit, offset]
  );

  const { rows: [ countRow ] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM products
     WHERE creator_id = $1 AND status != 'deleted'`,
    [creatorId]
  );

  const total = parseInt(countRow?.count ?? "0", 10);
  const productsWithFiles = await Promise.all(products.map(withFiles));

  return {
    products: productsWithFiles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};



export const updateProduct = async (
  productId: string,
  creatorId: string,
  updates: UpdateProductInput
): Promise<Product> => {
  const allowedFields = [
    "title",
    "description",
    "price_cents",
    "thumbnail",
  ] as const;

  const setClause: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClause.push(`${field} = $${paramCount}`);
      values.push(updates[field]);
      paramCount++;
    }
  }

  if (setClause.length === 0) throw new Error("No valid fields to update");

  setClause.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(productId, creatorId);

  const { rows: [product] } = await pool.query<Product>(
    `UPDATE products
     SET ${setClause.join(", ")}
     WHERE id = $${paramCount} AND creator_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (!product) throw new Error("Product not found or unauthorized");
  return product;
};

export const publishProduct = async (
  productId: string,
  creatorId: string
): Promise<Product> => {
  const { rows: [creator] } = await pool.query<{
    status: string;
    payout_enabled: boolean;
  }>(
    `SELECT status, payout_enabled FROM creator_profiles WHERE user_id = $1`,
    [creatorId]
  );

  if (!creator) throw new Error("Creator profile not found");
  if (creator.status !== "active") throw new Error("Only active creators can publish products");
  //if (!creator.payout_enabled) throw new Error("Complete payout onboarding before publishing");

  const { rows: [product] } = await pool.query<Product>(
    `UPDATE products
     SET status = 'published', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND creator_id = $2 AND status = 'draft'
     RETURNING *`,
    [productId, creatorId]
  );

  if (!product) throw new Error("Product not found or cannot be published");
  return product;
};

export const unpublishProduct = async (
  productId: string,
  creatorId: string
): Promise<Product> => {
  const { rows: [product] } = await pool.query<Product>(
    `UPDATE products
     SET status = 'unpublished', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND creator_id = $2 AND status = 'published'
     RETURNING *`,
    [productId, creatorId]
  );

  if (!product) throw new Error("Product not found or cannot be unpublished");
  return product;
};



export const deleteProduct = async (
  productId: string,
  creatorId: string
): Promise<void> => {
  // Verify ownership before doing anything
  const { rows: [product] } = await pool.query<Product>(
    `SELECT id FROM products WHERE id = $1 AND creator_id = $2`,
    [productId, creatorId]
  );

  if (!product) throw new Error("Product not found or unauthorized");

  // Fetch all attached files so we can clean up Cloudinary
  const { rows: files } = await pool.query<ProductFile>(
    `SELECT * FROM product_files WHERE product_id = $1`,
    [productId]
  );


  await Promise.all(
    files.map((file) =>
      cloudinary.uploader.destroy(file.public_id, { resource_type: "auto" })
    )
  );

  // Soft delete — keeps order history intact
  await pool.query(
    `UPDATE products SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [productId]
  );
};