import "dotenv/config";
import express from "express";
import authRouter from "./routes/auth.route.js";
import creatorRouter from "./routes/creator.routes.js";
import productRouter from "./routes/products.route.js";
import paymentRouter from "./routes/payment.route.js";
import downloadRouter from "./routes/download.routes.js";
import payoutRouter from "./routes/payout.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import adminRouter from "./routes/admin.routes.js";
import buyerRouter from "./routes/buyer.routes.js";
import couponRouter from "./routes/coupon.routes.js";
import buyerRouter from "./routes/buyer.routes.js";


const app = express();

app.use("/api/payments/webhook", express.raw({ type: "application/json" }));


app.use(express.json());


app.use("/api", authRouter);
app.use("/api", creatorRouter);
app.use("/api", productRouter);
app.use("/api", paymentRouter);
app.use("/api", downloadRouter);
app.use("/api", payoutRouter);
app.use("/api", dashboardRouter);
app.use("/api", adminRouter);
app.use("/api", buyerRouter);
app.use("/api", couponRouter);
app.use("/api", buyerRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`kliq server running on port ${PORT}`);
});

export default app;