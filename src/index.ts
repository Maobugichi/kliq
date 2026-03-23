import express from "express";
import authRouter from "./routes/auth.routes.js";
import creatorRouter from "./routes/creator.routes.js";
import productRouter from "./routes/product.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import downloadRouter from "./routes/download.routes.js";
import payoutRouter from "./routes/payouts.routes.js";
import dashboardRouter from "./routes/dashboard.route.js";
import adminRouter from "./routes/admin.route.js";

const app = express();

// Webhook must receive raw Buffer — BEFORE express.json()
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// JSON middleware for all other routes
app.use(express.json());

// Routes
app.use("/api", authRouter);
app.use("/api", creatorRouter);
app.use("/api", productRouter);
app.use("/api", paymentRouter);
app.use("/api", downloadRouter);
app.use("/api", payoutRouter);
app.use("/api", dashboardRouter);
app.use("/api", adminRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CreatorLock server running on port ${PORT}`);
});

export default app;