import pool from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import type { Product } from "./product.service.js";
import type { ProductFile } from "./file.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductFlag {
  id: string;
  product_id: string;
  flagged_by: string | null;
  reason: string;
  created_at: Date;
}

export interface FlaggedProduct extends Product {
  flag_reason: string;
  flagged_at: Date;
  creator_email: string;
  creator_name: string;
}

// ─── Flag a product ───────────────────────────────────────────────────────────

export const flagProduct = async (
  productId: string,
  adminId: string,
  reason: string
): Promise<FlaggedProduct> => {
  const { rows: [product] } = await pool.query<Product>(
    `SELECT * FROM products WHERE id = $1 AND status != 'deleted'`,
    [productId]
  );

  if (!product) throw new Error("Product not found or already deleted");

  await pool.query("BEGIN");

  try {
    // Set status to flagged
    await pool.query(
      `UPDATE products SET status = 'flagged', updated_at = NOW() WHERE id = $1`,
      [productId]
    );

    // Write flag reason to audit table
    await pool.query(
      `INSERT INTO product_flags (product_id, flagged_by, reason)
       VALUES ($1, $2, $3)`,
      [productId, adminId, reason]
    );

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  // Return updated product with flag info
  const { rows: [flagged] } = await pool.query<FlaggedProduct>(
    `SELECT p.*, pf.reason AS flag_reason, pf.created_at AS flagged_at,
            u.email AS creator_email, u.name AS creator_name
     FROM products p
     JOIN product_flags pf ON pf.product_id = p.id
     JOIN users u ON p.creator_id = u.id
     WHERE p.id = $1
     ORDER BY pf.created_at DESC
     LIMIT 1`,
    [productId]
  );

 if (!flagged) throw new Error("Failed to retrieve flagged product");
return flagged;
};

// ─── Unflag a product (restore to unpublished) ────────────────────────────────

export const unflagProduct = async (productId: string): Promise<Product> => {
  const { rows: [product] } = await pool.query<Product>(
    `UPDATE products
     SET status = 'unpublished', updated_at = NOW()
     WHERE id = $1 AND status = 'flagged'
     RETURNING *`,
    [productId]
  );

  if (!product) throw new Error("Product not found or not currently flagged");
  return product;
};

// ─── Force delete (admin removes product entirely) ────────────────────────────

export const forceDeleteProduct = async (productId: string): Promise<void> => {
  const { rows: [product] } = await pool.query<Product>(
    `SELECT * FROM products WHERE id = $1 AND status != 'deleted'`,
    [productId]
  );

  if (!product) throw new Error("Product not found or already deleted");

  // Destroy all Cloudinary files
  const { rows: files } = await pool.query<ProductFile>(
    `SELECT * FROM product_files WHERE product_id = $1`,
    [productId]
  );

  await Promise.all(
    files.map((f) =>
      cloudinary.uploader.destroy(f.public_id, { resource_type: "auto" })
    )
  );

  // Revoke all access tokens for this product
  await pool.query(
    `UPDATE access_tokens SET revoked = true WHERE product_id = $1`,
    [productId]
  );

  // Soft delete
  await pool.query(
    `UPDATE products SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
    [productId]
  );
};

// ─── List flagged products ────────────────────────────────────────────────────

export const getFlaggedProducts = async (): Promise<FlaggedProduct[]> => {
  const { rows } = await pool.query<FlaggedProduct>(
    `SELECT DISTINCT ON (p.id)
            p.*,
            pf.reason AS flag_reason,
            pf.created_at AS flagged_at,
            u.email AS creator_email,
            u.name AS creator_name
     FROM products p
     JOIN product_flags pf ON pf.product_id = p.id
     JOIN users u ON p.creator_id = u.id
     WHERE p.status = 'flagged'
     ORDER BY p.id, pf.created_at DESC`
  );

  return rows;
};