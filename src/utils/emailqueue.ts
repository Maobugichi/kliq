import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import {
  sendWaitlistConfirmationEmail,
  sendPasswordResetEmail,
  sendAffiliateInviteEmail,
  sendAffiliateConversionEmail,
  sendDownloadEmail,
  sendNewSaleEmail,
  sendBuyerBroadcastEmail,
} from "./mailer.util.js";
import { sendEmailVerification } from "../services/emailVerification.service.js";
import { notifyNewSale } from "../services/notification.service.js";

if (!process.env.UPSTASH_REDIS_URL) {
  throw new Error("UPSTASH_REDIS_URL is not set.");
}

export const connection = new Redis({
  host: "pan-balance-shoes-48064.db.redis.io",
  port: 14902,
  username: "default",
  password: process.env.REDIS_PASSWORD,
  //tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => Math.min(times * 200, 5_000),
});



import type { BuyerEmailTemplate } from "../types/email.types.js";
export type { BuyerEmailTemplate }; 

export type EmailJobData =
  | { name: "waitlist.confirmation";  payload: { email: string } }
  | { name: "email.verification";     payload: { id: string; email: string } }
  | { name: "password.reset";         payload: { email: string; token: string } }
  | { name: "affiliate.invited";      payload: {
        to: string; affiliateName: string; creatorName: string;
        storeUrl: string; commissionPercent: number; affiliateCode: string;
      }}
  | { name: "affiliate.conversion";   payload: {
        to: string; affiliateName: string; productTitle: string;
        commissionCents: number; totalEarnedCents: number;
      }}
  | { name: "order.download";         payload: { email: string; name: string; productTitle: string; token: string;  magicLinkUrl?: string; } }
  | { name: "order.sale";             payload: {
        creatorId: string;
        creatorEmail: string;
        creatorName: string;
        productTitle: string;
        amountCents: number;
        buyerName: string;
      }}
  | { name: "buyer.broadcast";        payload: {
        to: string;
        buyerName: string;
        creatorName: string;
        template: BuyerEmailTemplate; 
        subject: string;             
        body: string;                 // editable copy for all templates
        couponCode?: string;          // only used by "discount" template
        productTitle?: string;        // only used by "new_product" template
        productUrl?: string;          // only used by "new_product" template
      }};

export type EmailJobName = EmailJobData["name"];

// ─── Queue ────────────────────────────────────────────────────────────────────

export const emailQueue = new Queue<EmailJobData>("emails", {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

// ─── Enqueue helpers ──────────────────────────────────────────────────────────

export const enqueue = async (job: EmailJobData): Promise<void> => {
  await emailQueue.add(job.name, job);
};

export const enqueueWaitlistConfirmation = (email: string) =>
  enqueue({ name: "waitlist.confirmation", payload: { email } });

export const enqueueEmailVerification = (id: string, email: string) =>
  enqueue({ name: "email.verification", payload: { id, email } });

export const enqueuePasswordReset = (email: string, token: string) =>
  enqueue({ name: "password.reset", payload: { email, token } });

export const enqueueAffiliateInvited = (payload: Extract<EmailJobData, { name: "affiliate.invited" }>["payload"]) =>
  enqueue({ name: "affiliate.invited", payload });

export const enqueueAffiliateConversion = (payload: Extract<EmailJobData, { name: "affiliate.conversion" }>["payload"]) =>
  enqueue({ name: "affiliate.conversion", payload });

export const enqueueOrderDownload = (payload: Extract<EmailJobData, { name: "order.download" }>["payload"]) =>
  enqueue({ name: "order.download", payload });

export const enqueueOrderSale = (payload: Extract<EmailJobData, { name: "order.sale" }>["payload"]) =>
  enqueue({ name: "order.sale", payload });

export const enqueueBuyerBroadcast = (
  payload: Extract<EmailJobData, { name: "buyer.broadcast" }>["payload"]
) => enqueue({ name: "buyer.broadcast", payload });

// ─── Worker ───────────────────────────────────────────────────────────────────

export const startEmailWorker = (): Worker<EmailJobData> => {
  const worker = new Worker<EmailJobData>(
    "emails",
    async (job: Job<EmailJobData>) => {
      const { name, payload } = job.data;

      switch (name) {
        case "waitlist.confirmation":
          await sendWaitlistConfirmationEmail(payload.email);
          break;

        case "email.verification":
          await sendEmailVerification(payload.id, payload.email);
          break;

        case "password.reset":
          await sendPasswordResetEmail(payload.email, payload.token);
          break;

        case "affiliate.invited":
          await sendAffiliateInviteEmail(
            payload.to,
            payload.affiliateName,
            payload.creatorName,
            payload.storeUrl,
            payload.commissionPercent,
            payload.affiliateCode
          );
          break;

        case "affiliate.conversion":
          await sendAffiliateConversionEmail(
            payload.to,
            payload.affiliateName,
            payload.productTitle,
            payload.commissionCents,
            payload.totalEarnedCents
          );
          break;

        case "order.download":
          await sendDownloadEmail(
            payload.email,
            payload.name,
            payload.productTitle,
            payload.token,
            payload.magicLinkUrl
          );
          break;

        case "order.sale":
          await Promise.all([
            notifyNewSale(
              payload.creatorId,
              payload.productTitle,
              payload.amountCents,
              payload.buyerName
            ),
            sendNewSaleEmail(
              payload.creatorEmail,
              payload.creatorName,
              payload.productTitle,
              payload.amountCents,
              payload.buyerName
            ),
          ]);
          break;

        case "buyer.broadcast":
          await sendBuyerBroadcastEmail(payload);
          break;

        default: {
          const _exhaustive: never = name;
          throw new Error(`Unknown email job: ${_exhaustive}`);
        }
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on("completed", (job) =>
    console.log(`[emailWorker] ✓ ${job.id} (${job.data.name}) completed`)
  );

  worker.on("failed", (job, err) =>
    console.error(`[emailWorker] ✗ ${job?.id} (${job?.data.name}) failed: ${err.message}`)
  );

  return worker;
};

// ─── Webhook handler ──────────────────────────────────────────────────────────

export interface EmailWebhookEvent {
  type: "email.delivered" | "email.bounced" | "email.complained";
  email: string;
  timestamp: string;
  [key: string]: unknown;
}

export const handleEmailWebhook = async (
  event: EmailWebhookEvent
): Promise<void> => {
  switch (event.type) {
    case "email.delivered":
      console.log(`[webhook] Delivered → ${event.email}`);
      break;
    case "email.bounced":
      console.warn(`[webhook] Bounced → ${event.email}`);
      // TODO: add to suppression list
      break;
    case "email.complained":
      console.warn(`[webhook] Spam complaint → ${event.email}`);
      // TODO: unsubscribe
      break;
    default:
      console.log(`[webhook] Unhandled event: ${(event as EmailWebhookEvent).type}`);
  }
};