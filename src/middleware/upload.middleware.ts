import multer from "multer";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction as ExpressNextFunction,
  RequestHandler,
} from "express";
import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.js";
import { Readable } from "stream";



// ─── Temp dir ─────────────────────────────────────────────────────────────────

const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ─── Allowed MIME types ───────────────────────────────────────────────────────

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/svg+xml": "image",
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
  "text/plain": "document",
  "text/csv": "document",
  "text/html": "document",
  "application/json": "document",
  "application/epub+zip": "ebook",
  "application/x-mobipocket-ebook": "ebook",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/flac": "audio",
  "audio/aac": "audio",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/x-msvideo": "video",
  "video/webm": "video",
  "application/zip": "archive",
  "application/x-zip-compressed": "archive",
  "application/x-rar-compressed": "archive",
  "application/x-7z-compressed": "archive",
  "application/octet-stream": "other",
};

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;  // 5MB

// ─── Storage ──────────────────────────────────────────────────────────────────

const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "temp/"),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

// ─── File filters — use ExpressRequest to avoid global Request collision ──────

const imageFilter = (
  _req: ExpressRequest,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (IMAGE_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' is not allowed for thumbnails`));
  }
};

const digitalFileFilter = (
  _req: ExpressRequest,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' is not allowed`));
  }
};

// ─── Multer instances ─────────────────────────────────────────────────────────

const _thumbnailMulter = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

export const upload = multer({
  storage: diskStorage,
  fileFilter: digitalFileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── Cloudinary stream helper ─────────────────────────────────────────────────

function streamBufferToCloudinary(
  buffer: Buffer,
  folder: string
): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, transformation: [{ width: 800, height: 600, crop: "limit" }] },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

// ─── uploadThumbnail middleware array ─────────────────────────────────────────

const thumbnailUploadHandler: RequestHandler = async (
  req: ExpressRequest,
  _res: ExpressResponse,
  next: ExpressNextFunction
): Promise<void> => {
  if (!req.file) return next();

  try {
    const { secure_url, public_id } = await streamBufferToCloudinary(
      req.file.buffer,
      "kliq/thumbnails"
    );

    req.file.path = secure_url;
    req.file.filename = public_id;
    req.file.buffer = Buffer.alloc(0);

    next();
  } catch (err) {
    next(err);
  }
};

export const uploadThumbnail: RequestHandler[] = [
  _thumbnailMulter.single("thumbnail") as RequestHandler,
  thumbnailUploadHandler,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getFileCategory = (mimetype: string): string | null =>
  ALLOWED_TYPES[mimetype] ?? null;