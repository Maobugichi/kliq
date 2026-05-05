import "dotenv/config";
import express from "express";
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
import waitlistRouter from "./routes/waitlist.routes.js"
// import emailListRouter from "./routes/emailList.routes.js";

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://creatorlock.co",
  "https://www.creatorlock.co",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);



app.use("/api/payments/webhook", express.raw({ type: "application/json" }));


app.use(express.json());


app.use((req, res, next) => {
  console.log(`🔥 ${req.method} ${req.url}`);
  next();
});



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


// app.use("/api", emailListRouter);


app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  next();
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`kliq server running on port ${PORT}`);
});

export default app;