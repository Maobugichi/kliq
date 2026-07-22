import { resolveAffiliateCode, recordAffiliateConversion, sendAffiliateConversionNotification } from "./affiliate.service.js";
import crypto from "crypto";
import pool from "../config/db.js";
import { generateAccessToken } from "./access-token.service.js";
import { sendDownloadEmail } from "../utils/mailer.util.js";
import { applyCoupon, incrementCouponUsage } from "./coupon.service.js";
import { notifyNewSale, notifyAffiliateSale, notifyCommissionEarned } from "./notification.service.js";
import { enqueueOrderDownload, enqueueOrderSale } from "../utils/emailqueue.js";
import { generateMagicLinkToken } from "../utils/token.util.js";


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
  buyerId?: string;
  productId: string;
  email: string;
  couponCode?: string;
  affiliateCode?: string;
  guestEmail?: string;
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

export const findOrCreateGuestBuyer = async (
  email: string
): Promise<{ id: string; name: string | null }> => {
  const {
    rows: [user],
  } = await pool.query<{ id: string; name: string | null }>(
    `INSERT INTO users (email, role)
     VALUES ($1, 'guest')
     ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
     RETURNING id, name`,
    [email]
  );

  if (!user) throw new Error("Failed to resolve guest buyer");

  return user;
};

export const initiatePayment = async ({
  buyerId,
  guestEmail,
  productId,
  email,
  couponCode,
  affiliateCode,
}: InitiatePaymentInput): Promise<InitiatePaymentResult> => {
  if (!buyerId && !guestEmail) {
    throw new Error("Either buyerId or guestEmail is required");
  }

  let resolvedBuyerId = buyerId;

  if (!resolvedBuyerId) {
    const guest = await findOrCreateGuestBuyer(guestEmail!);
    resolvedBuyerId = guest.id;
  }

  const {
    rows: [product],
  } = await pool.query<{
    id: string;
    price_cents: number;
    status: string;
    title: string;
    creator_id: string;
  }>(`SELECT id, price_cents, status, title, creator_id FROM products WHERE id = $1`, [
    productId,
  ]);

  if (!product) throw new Error("Product not found");
  if (product.status !== "published") throw new Error("Product is not available");

  const {
    rows: [existingOrder],
  } = await pool.query<{ id: string }>(
    `SELECT id FROM orders WHERE buyer_id = $1 AND product_id = $2 AND status = 'paid'`,
    [resolvedBuyerId, productId]
  );

  if (existingOrder) throw new Error("You already own this product");

  let finalPriceCents = product.price_cents;
  let discountCents = 0;
  let couponId: string | null = null;

  if (couponCode && product.price_cents > 0) {
    const couponResult = await applyCoupon(couponCode, product.creator_id, product.price_cents);
    finalPriceCents = couponResult.final_price_cents;
    discountCents = couponResult.discount_cents;
    couponId = couponResult.coupon_id;
  }

  const ref = `cl-${crypto.randomUUID()}`;

  if (finalPriceCents === 0) {
    const client = await pool.connect();
    let rawToken: string;
    let buyerName: string;
    let buyerRole: string | null;

    try {
      await client.query("BEGIN");

      const {
        rows: [order],
      } = await client.query<{ id: string }>(
        `INSERT INTO orders (buyer_id, product_id, amount_cents, paystack_ref, status)
         VALUES ($1, $2, 0, $3, 'paid')
         RETURNING id`,
        [resolvedBuyerId, productId, ref]
      );

      if (!order) throw new Error("Failed to create order");

      rawToken = await generateAccessToken(resolvedBuyerId, productId, order.id, client);

      const {
        rows: [buyer],
      } = await client.query<{ name: string; role: string | null }>(
        `SELECT name, role FROM users WHERE id = $1`,
        [resolvedBuyerId]
      );

      buyerName = buyer?.name ?? "there";
      buyerRole = buyer?.role ?? null;

      if (couponId) await incrementCouponUsage(couponId);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const isGuest = buyerRole! === "guest";
    const magicLinkUrl = isGuest
      ? `${process.env.FRONTEND_URL}/buyer/library/magic?token=${generateMagicLinkToken(resolvedBuyerId)}`
      : undefined;

    await enqueueOrderDownload({
      email,
      name: buyerName,
      productTitle: product.title,
      token: rawToken!,
      ...(magicLinkUrl && { magicLinkUrl }),
    });

    return {
      paymentUrl: null,
      ref,
      free: true,
      originalPriceCents: product.price_cents,
      discountCents,
      finalPriceCents: 0,
    };
  }

  let resolvedAffiliate = null;
  if (affiliateCode) {
    resolvedAffiliate = await resolveAffiliateCode(affiliateCode);
    if (!resolvedAffiliate) throw new Error("Invalid or inactive affiliate code");
  }

  await pool.query(
    `INSERT INTO orders (
        buyer_id,
        product_id,
        amount_cents,
        currency,
        paystack_ref,
        status,
        affiliate_code
    )
    VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
    [
      resolvedBuyerId,
      productId,
      finalPriceCents,
      "NGN",
      ref,
      resolvedAffiliate?.code ?? null,
    ]
  );

  const data = await paystackRequest("POST", "/transaction/initialize", {
    email,
    amount: finalPriceCents,
    reference: ref,
    metadata: {
      buyer_id: resolvedBuyerId,
      product_id: productId,
      product_title: product.title,
      coupon_id: couponId ?? undefined,
    },
  });

  if (couponId) {
    await pool.query(`UPDATE orders SET coupon_id = $1 WHERE paystack_ref = $2`, [couponId, ref]);
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

export const verifyWebhookSignature = (rawBody: Buffer, signature: string): boolean => {
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
};

export const handlePaystackWebhook = async (
  event: string,
  data: Record<string, any>
): Promise<void> => {
  if (event !== "charge.success") return;

  const ref = data.reference as string;
  console.log(`[webhook] ① received charge.success for ref: ${ref}`);

  if (!ref) {
    throw new Error("Missing transaction reference");
  }

  const {
    rows: [order],
  } = await pool.query<Order & { coupon_id: string | null; affiliate_code: string | null }>(
    `SELECT * FROM orders WHERE paystack_ref = $1 AND status = 'pending'`,
    [ref]
  );

  if (!order) {
    console.log(`[webhook] ② no pending order found for ref: ${ref} — already processed or unknown ref`);
    return;
  }

  console.log(`[webhook] ② found pending order: ${order.id}, buyer_id: ${order.buyer_id}, amount: ${order.amount_cents}, currency: ${order.currency}`);

  const verifiedTx = await verifyTransaction(ref);
  const { data: verifiedData } = verifiedTx;

  console.log(`[webhook] ③ paystack verification — status: ${verifiedData.status}, amount: ${verifiedData.amount}, currency: ${verifiedData.currency}`);

  if (verifiedData.status !== "success") {
    throw new Error(`Paystack verification failed for ${ref}`);
  }

  if (Number(verifiedData.amount) !== Number(order.amount_cents)) {
   
    throw new Error(`Amount mismatch. Expected ${order.amount_cents}, got ${verifiedData.amount}`);
  }

  if (verifiedData.currency?.toUpperCase() !== order.currency?.toUpperCase()) {
    console.error(`[webhook] ④ currency mismatch — expected: ${order.currency}, got: ${verifiedData.currency}`);
    throw new Error(`Currency mismatch. Expected ${order.currency}, got ${verifiedData.currency}`);
  }



  const { rows: [buyer] } = await pool.query<{ email: string; name: string; role: string | null }>(
    `SELECT email, name, role FROM users WHERE id = $1`,
    [order.buyer_id]
  );

 

  const { rows: [product] } = await pool.query<{
    title: string;
    creator_id: string;
    creator_user_id: string;
    creator_email: string;
    creator_name: string;
  }>(
    `SELECT p.title, p.creator_id, c.user_id AS creator_user_id,
            u.email AS creator_email, u.name AS creator_name
     FROM products p
     JOIN creator_profiles c ON c.id = p.creator_id
     JOIN users u ON u.id = c.user_id
     WHERE p.id = $1`,
    [order.product_id]
  );

 

  if (!product) throw new Error("Product not found");

  const client = await pool.connect();
  let rawToken: string;
  // Populated inside the transaction if this order has an affiliate attached.
  // Only used to fire the commission-earned notification, and only after
  // the transaction below has actually committed.
  let affiliateConversion: { affiliateUserId: string; affiliateId: string; commissionCents: number } | null = null;

  try {
    await client.query("BEGIN");
    console.log(`[webhook] ⑦ transaction BEGIN`);

    const { rows: [lockedOrder] } = await client.query(
      `SELECT id FROM orders WHERE id = $1 FOR UPDATE`,
      [order.id]
    );

    if (!lockedOrder) {
      await client.query("ROLLBACK");
      return;
    }

    const { rowCount } = await client.query(
      `UPDATE orders SET status = 'paid', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [order.id]
    );

    

    if (rowCount === 0) {
      
      await client.query("ROLLBACK");
      return;
    }

    rawToken = await generateAccessToken(order.buyer_id, order.product_id, order.id, client);
  

    if (order.affiliate_code) {
      // Runs on this same transaction client — if anything below throws and
      // this transaction rolls back, the conversion record rolls back with it.
      affiliateConversion = await recordAffiliateConversion(
        client,
        order.affiliate_code,
        order.id,
        order.amount_cents
      );
      console.log(`[webhook] ⑨ affiliate conversion recorded ✓`);
    }

    if (order.coupon_id) {
      await incrementCouponUsage(order.coupon_id);
      console.log(`[webhook] ⑨ coupon usage incremented ✓`);
    }

    await client.query("COMMIT");
    console.log(`[webhook] ⑩ COMMIT ✓ — order ${order.id} marked paid`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[webhook] ⑩ transaction error, ROLLBACK:`, err);
    throw err;
  } finally {
    client.release();
  }

  // Everything past this point only runs once the transaction above has
  // actually committed — the order is durably 'paid' before any email fires.
  if (affiliateConversion) {
    await notifyCommissionEarned(
      affiliateConversion.affiliateUserId,
      product.title,
      affiliateConversion.commissionCents
    );
    await sendAffiliateConversionNotification(
      affiliateConversion.affiliateUserId,
      product.title,
      affiliateConversion.commissionCents
    );
  }

  if (buyer && product) {
    const isGuest = buyer.role === "guest";
    const magicLinkUrl = isGuest
      ? `${process.env.FRONTEND_URL}/buyer/library/magic?token=${generateMagicLinkToken(order.buyer_id)}`
      : undefined;

    console.log(`[webhook] ⑪ enqueueing download email — isGuest: ${isGuest}, hasMagicLink: ${!!magicLinkUrl}`);

    await enqueueOrderDownload({
      email: buyer.email,
      name: buyer.name,
      productTitle: product.title,
      token: rawToken!,
      ...(magicLinkUrl && { magicLinkUrl }),
    });

    console.log(`[webhook] ⑫ enqueueing sale email`);

    await enqueueOrderSale({
      creatorId: product.creator_user_id,
      creatorEmail: product.creator_email,
      creatorName: product.creator_name,
      productTitle: product.title,
      amountCents: order.amount_cents,
      buyerName: buyer.name,
    });

    if (order.affiliate_code) {
      const { rows: [affiliate] } = await pool.query<{ name: string | null }>(
        `SELECT u.name
         FROM affiliates a
         JOIN users u ON u.id = a.affiliate_user_id
         WHERE a.code = $1`,
        [order.affiliate_code]
      );

      await notifyAffiliateSale(
        product.creator_user_id,
        product.title,
        order.amount_cents,
        buyer.name,
        affiliate?.name ?? 'An affiliate'
      );
    } else {
      await notifyNewSale(
        product.creator_user_id,
        product.title,
        order.amount_cents,
        buyer.name
      );
    }

    console.log(`[webhook] ⑬ all done ✓`);
  }
};

export const verifyTransaction = async (reference: string) => {
  const paystackResponse = await paystackRequest("GET", `/transaction/verify/${reference}`);

  const { rows: [joinOrder] } = await pool.query(
    `SELECT orders.*, products.title as product_title 
     FROM orders 
     JOIN products ON orders.product_id = products.id
     WHERE orders.paystack_ref = $1`,
    [reference]
  );

  return {
    data: paystackResponse.data,
    order: joinOrder ?? null,
  };
};