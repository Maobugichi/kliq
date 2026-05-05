import multer from "multer";
import type { Request } from "express";
import fs from "fs";
import path from "path";

const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const ALLOWED_TYPES: Record<string, string> = {
  // Images
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/svg+xml": "image",

  // Documents
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document", // .docx
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",       // .xlsx
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document", // .pptx
  "text/plain": "document",
  "text/csv": "document",
  "text/html": "document",
  "application/json": "document",

  // Ebooks
  "application/epub+zip": "ebook",
  "application/x-mobipocket-ebook": "ebook", // .mobi

  // Audio
  "audio/mpeg": "audio",   // .mp3
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/flac": "audio",
  "audio/aac": "audio",

  // Video
  "video/mp4": "video",
  "video/quicktime": "video",  // .mov
  "video/x-msvideo": "video",  // .avi
  "video/webm": "video",

  // Archives
  "application/zip": "archive",
  "application/x-zip-compressed": "archive",
  "application/x-rar-compressed": "archive",
  "application/x-7z-compressed": "archive",

  // Generic binary fallback
  "application/octet-stream": "other",
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