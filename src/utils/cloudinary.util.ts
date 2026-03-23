import cloudinary from "../config/cloudinary.js";

export interface UploadableFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadResult {
  url: string;
  public_id: string;
  format: string | null;
  size: number | null;
}

export const uploadFileToCloudinary = async (
  file: UploadableFile
): Promise<UploadResult> => {
  const result = await cloudinary.uploader.upload(file.path, {
    resource_type: "auto",
    folder: "products",
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
    format: result.format ?? null,
    size: result.bytes ?? null,
  };
};