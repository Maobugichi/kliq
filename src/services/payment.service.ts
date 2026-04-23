import { resolveAffiliateCode, recordAffiliateConversion } from "./affiliate.service.js";
import crypto from "crypto";
import pool from "../config/db.js";
import { generateAccessToken } from "./access-token.service.js";
import { sendDownloadEmail } from "../utils/mailer.util.js";
import { applyCoupon, incrementCouponUsage } from "./coupon.service.js";
import { notifyNewSale } from "./notification.service.js";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE = "https://api.paystack.co";



export interface Order {
  id: string;
  buyer_id: string;
  product_id: string;
  amount_cents: number;
  currency: string;
  paystack_ref: string;
  status: "pending" | "paid" | "failed" | "refunded";
  created_at: Date;
  updated_at: Date;
}

interface InitiatePaymentInput {
  buyerId: string;
  productId: string;
  email: string;
  couponCode?: string;
  affiliateCode?: string;
}

export interface InitiatePaymentResult {
  paymentUrl: string | null;
  ref: string;
  free: boolean;
  originalPriceCents?: number;
  discountCents?: number;
  finalPriceCents?: number;
}



const paystackRequest = async (
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
) => {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message ?? "Paystack request failed");
  return data;
};



export const initiatePayment = async ({
  buyerId,
  productId,
  email,
  couponCode,
  affiliateCode
}: InitiatePaymentInput): Promise<InitiatePaymentResult> => {
  const { rows: [product] } = await pool.query<{
    id: string;
    price_cents: number;
    status: string;
    title: string;
    creator_id: string;
  }>(
    `SELECT id, price_cents, status, title, creator_id FROM products WHERE id = $1`,
    [productId]
  );

  if (!product) throw new Error("Product not found");
  if (product.status !== "published") throw new Error("Product is not available");

  const { rows: [existingOrder] } = await pool.query<{ id: string }>(
    `SELECT id FROM orders
     WHERE buyer_id = $1 AND product_id = $2 AND status = 'paid'`,
    [buyerId, productId]
  );

  if (existingOrder) throw new Error("You already own this product");

  // ── Apply coupon if provided ───────────────────────────────────────────────
  let finalPriceCents = product.price_cents;
  let discountCents = 0;
  let couponId: string | null = null;

  if (couponCode && product.price_cents > 0) {
    const couponResult = await applyCoupon(
      couponCode,
      product.creator_id,
      product.price_cents
    );
    finalPriceCents = couponResult.final_price_cents;
    discountCents = couponResult.discount_cents;
    couponId = couponResult.coupon_id;
  }

  const ref = `cl-${buyerId.slice(0, 8)}-${Date.now()}`;

  // ── Free product (or 100% coupon) — skip Paystack ─────────────────────────
  if (finalPriceCents === 0) {
    await pool.query("BEGIN");
    try {
      const { rows: [order] } = await pool.query<{ id: string }>(
        `INSERT INTO orders (buyer_id, product_id, amount_cents, paystack_ref, status)
         VALUES ($1, $2, 0, $3, 'paid')
         RETURNING id`,
        [buyerId, productId, ref]
      );

      if (!order) throw new Error("Failed to create order");

      const rawToken = await generateAccessToken(buyerId, productId, order.id);

      const { rows: [buyer] } = await pool.query<{ name: string }>(
        `SELECT name FROM users WHERE id = $1`,
        [buyerId]
      );

      await sendDownloadEmail(email, buyer?.name ?? "there", product.title, rawToken);

      // Increment coupon usage if applied
      if (couponId) await incrementCouponUsage(couponId);

      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }

    return {
      paymentUrl: null,
      ref,
      free: true,
      originalPriceCents: product.price_cents,
      discountCents,
      finalPriceCents: 0,
    };
  }

  // ── Paid product — create pending order + Paystack checkout ───────────────
  await pool.query(
    `INSERT INTO orders (buyer_id, product_id, amount_cents, paystack_ref, status,affiliate_code)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [buyerId, productId, finalPriceCents, ref, affiliateCode ?? null]
  );

  const data = await paystackRequest("POST", "/transaction/initialize", {
    email,
    amount: finalPriceCents,
    reference: ref,
    metadata: {
      buyer_id: buyerId,
      product_id: productId,
      product_title: product.title,
      coupon_id: couponId ?? undefined,
    },
  });

  // Store coupon_id in orders so webhook can increment usage on success
  if (couponId) {
    await pool.query(
      `UPDATE orders SET coupon_id = $1 WHERE paystack_ref = $2`,
      [couponId, ref]
    );
  }

  return {
    paymentUrl: data.data.authorization_url,
    ref,
    free: false,
    originalPriceCents: product.price_cents,
    discountCents,
    finalPriceCents,
  };
};

// ─── Verify webhook signature ─────────────────────────────────────────────────

export const verifyWebhookSignature = (
  rawBody: Buffer,
  signature: string
): boolean => {
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(rawBody)
    .digest("hex");
  return hash === signature;
};

// ─── Handle webhook ───────────────────────────────────────────────────────────

export const handlePaystackWebhook = async (
  event: string,
  data: Record<string, any>
): Promise<void> => {
  if (event !== "charge.success") return;

  const ref = data.reference as string;
  

  const { rows: [order] } = await pool.query<Order & {  
    coupon_id: string | null;
    affiliate_code: string | null; }>(
    `SELECT * FROM orders WHERE paystack_ref = $1 AND status = 'pending'`,
    [ref]
  );

  if (!order) return;

  const { rows: [buyer] } = await pool.query<{ email: string; name: string }>(
    `SELECT email, name FROM users WHERE id = $1`,
    [order.buyer_id]
  );

  const { rows: [product] } = await pool.query<{ title: string; creator_id:string; }>(
    `SELECT  title, creator_id, FROM products WHERE id = $1`,
    [order.product_id]
  );

  await pool.query("BEGIN");

  try {
    await pool.query(
      `UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
      [order.id]
    );

    const rawToken = await generateAccessToken(
      order.buyer_id,
      order.product_id,
      order.id
    );

    if (buyer && product) {
      await sendDownloadEmail(buyer.email, buyer.name, product.title, rawToken);

      await notifyNewSale(
        product.creator_id,
        product.title,
        order.amount_cents,
        buyer.name
      );
    }
   
    if (order.affiliate_code) {
      await recordAffiliateConversion(order.affiliate_code, order.id, order.amount_cents);
    }


    // Increment coupon usage if one was applied
    if (order.coupon_id) {
      await incrementCouponUsage(order.coupon_id);
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
};