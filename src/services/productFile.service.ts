import pool from "../config/db.js";
import { uploadFileToCloudinary, type UploadableFile } from "../utils/cloudinary.util.js";
import { getFileCategory } from "../middleware/upload.middleware.js";


export interface ProductFile {
  id: string;
  product_id: string;
  url: string;
  public_id: string;
  format: string | null;
  size: number | null;
  category: string | null;
  original_name: string | null;
  created_at: Date;
}






export const attachFileToProduct = async (
  productId: string,
  file: UploadableFile
): Promise<ProductFile> => {
  
  const uploaded = await uploadFileToCloudinary(file);

 
  const { rows: [productFile] } = await pool.query<ProductFile>(
    `INSERT INTO product_files
       (product_id, url, public_id, format, size, category, original_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      productId,
      uploaded.url,
      uploaded.public_id,
      uploaded.format ?? null,
      uploaded.size ?? null,
      file.mimetype ? getFileCategory(file.mimetype) : null,
      file.originalname ?? null,
    ]
  );

  if (!productFile) throw new Error("Failed to save file record");

  return productFile;
};


export const getProductFiles = async (
  productId: string
): Promise<ProductFile[]> => {
  const { rows } = await pool.query<ProductFile>(
    `SELECT * FROM product_files WHERE product_id = $1 ORDER BY created_at ASC`,
    [productId]
  );

  return rows;
};

// Delete a single file — removes from DB (you can extend to delete from Cloudinary too)
export const deleteProductFile = async (
  fileId: string,
  productId: string
): Promise<void> => {
  const { rowCount } = await pool.query(
    `DELETE FROM product_files WHERE id = $1 AND product_id = $2`,
    [fileId, productId]
  );

  if (!rowCount || rowCount === 0) {
    throw new Error("File not found or does not belong to this product");
  }
};