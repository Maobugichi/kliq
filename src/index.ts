import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";

import authRouter from "./routes/auth.route.js";
import creatorRouter from "./routes/creator.routes.js";
import productRouter from "./routes/products.route.js";
import paymentRouter from "./routes/payment.route.js";
import downloadRouter from "./routes/download.routes.js";
import payoutRouter from "./routes/payout.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import adminRouter from "./routes/admin.routes.js";
import buyerRouter from "./routes/buyer.route.js";
import couponRouter from "./routes/coupon.route.js";
import affiliateRouter from "./routes/affiliate.route.js";
import notificationRouter from "./routes/notification.route.js";
import waitlistRouter from "./routes/waitlist.routes.js";
import type multer from "multer";

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://creatorlock.co",
  "https://www.creatorlock.co",
].filter(Boolean) as string[];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));



// ─── Body parsers ─────────────────────────────────────────────────────────────

// Webhook must receive raw body — register BEFORE express.json()
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// ─── Request logger ───────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`🔥 ${req.method} ${req.url}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api", authRouter);
app.use("/api", creatorRouter);
app.use("/api", productRouter);
app.use("/api", paymentRouter);
app.use("/api", downloadRouter);
app.use("/api", dashboardRouter);
app.use("/api", waitlistRouter);
app.use("/api", notificationRouter);
app.use("/api", payoutRouter);
app.use("/api", adminRouter);
app.use("/api", buyerRouter);
app.use("/api", couponRouter);
app.use("/api", affiliateRouter);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", time: new Date().toISOString() });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((req: Request, res: Response) => {
  console.warn(`⚠️  404 — ${req.method} ${req.path}`);
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// In index.ts global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Handle Multer errors cleanly
  if (err.name === "MulterError") {
    const multerErr = err as multer.MulterError;
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: "File is too large",
      LIMIT_FILE_COUNT: "Too many files",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field",
    };
    return res.status(400).json({
      success: false,
      message: messages[multerErr.code] ?? multerErr.message,
    });
  }

  console.error(` [${req.method} ${req.path}]`, err.message);
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message ?? "Internal Server Error" });
});

// ─── Process-level error catchers ────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error(" Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error(" Unhandled Rejection:", reason);
});

// ─── Start ────────────────────────────────────────────────────────────────────


const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`kliq server running on port ${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`💥 Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    throw err;
  }
});

export default app;