import type { Request, Response } from "express";
import {
  initiatePayment,
  verifyWebhookSignature,
  handlePaystackWebhook,
} from "../services/payment.service.js";

// POST /payments/initiate
export const initiate = async (req: Request, res: Response) => {
  try {
    const buyerId = req.user!.id;
    const email = req.user!.email;
    const { product_id, coupon_code } = req.body as {
      product_id: string;
      coupon_code?: string;
    };


    if (!product_id) {
      return res.status(400).json({ success: false, message: "product_id is required" });
    }

    const result = await initiatePayment({
      buyerId,
      productId: product_id,
      email,
      ...(coupon_code !== undefined && { couponCode: coupon_code }),
    });

    return res.status(200).json({
      success: true,
      message: result.free
        ? "Free product claimed — check your email for the download link"
        : "Payment initiated",
      data: result,
    });
  } catch (err) {
    if (err instanceof Error) {
      const clientErrors = [
        "Product not found",
        "Product is not available",
        "You already own this product",
      ];
      if (clientErrors.includes(err.message)) {
        return res.status(400).json({ success: false, message: err.message });
      }
    }

    console.error("initiate payment error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// POST /payments/webhook
export const webhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-paystack-signature"] as string;

    if (!signature) {
      return res.status(400).json({ message: "Missing signature" });
    }

    const isValid = verifyWebhookSignature(req.body, signature);

    if (!isValid) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const { event, data } = JSON.parse(req.body.toString());

    await handlePaystackWebhook(event, data);

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(200).json({ received: true });
  }
};