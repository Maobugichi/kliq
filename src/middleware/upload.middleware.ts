import multer from "multer";
import type { Request } from "express";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "application/pdf": "document",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "video/mp4": "video",
  "video/quicktime": "video",
  "application/zip": "archive",
  "application/x-zip-compressed": "archive",
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "temp/"),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' is not allowed`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export const getFileCategory = (mimetype: string): string | null =>
  ALLOWED_TYPES[mimetype] ?? null;