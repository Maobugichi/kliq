import type { Request, Response } from "express";
import {
  initiatePayment,
  verifyWebhookSignature,
  handlePaystackWebhook,
  verifyTransaction,
} from "../services/payment.service.js";
import { resolveAffiliateCode } from "../services/affiliate.service.js";
import { handlePayoutWebhook } from "../services/payout.service.js";

export const initiate = async (req: Request, res: Response) => {
  try {
    const buyerId = req.user!.id;
    const email = req.user!.email;
    const { product_id, coupon_code, affiliate_code } = req.body as {
      product_id: string;
      coupon_code?: string;
      affiliate_code?:string;
    };


    if (!product_id) {
      return res.status(400).json({ success: false, message: "product_id is required" });
    }

    //const resolvedAffiliate = await resolveAffiliateCode(affiliate_code)

    const result = await initiatePayment({
      buyerId,
      productId: product_id,
      email,
      ...(coupon_code !== undefined && { couponCode: coupon_code }),
      ...(affiliate_code !== undefined && { affiliateCode: affiliate_code })
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
  const signature = req.headers["x-paystack-signature"] as string;

  if (!signature) {
    return res.status(400).json({ message: "Missing signature" });
  }

  const isValid = verifyWebhookSignature(req.body, signature);

  if (!isValid) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  // Acknowledge immediately — Paystack retries if it doesn't receive a fast 200
  res.status(200).json({ received: true });

  try {
    const { event, data } = JSON.parse(req.body.toString());

    if (event === "charge.success") {
      await handlePaystackWebhook(event, data);
      return;
    }

    if (
      event === "transfer.success" ||
      event === "transfer.failed"   ||
      event === "transfer.reversed"
    ) {
      await handlePayoutWebhook(event, data);
      return;
    }

    console.log(`[webhook] Unhandled event: ${event}`);
  } catch (err) {
    // Response already sent — log only, never re-throw
    console.error("[webhook] Processing error:", err);
  }
}

// payment.controller.ts
export const verify = async (req: Request, res: Response) => {
  try {
    const reference = req.params.reference as string;
    const result = await verifyTransaction(reference);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("verify error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};