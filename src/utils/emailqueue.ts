import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import {
  sendWaitlistConfirmationEmail,
  sendPasswordResetEmail,
  
} from "./mailer.util.js";
import { sendEmailVerification } from "../services/emailVerification.service.js";

if (!process.env.UPSTASH_REDIS_URL) {
  throw new Error("UPSTASH_REDIS_URL is not set.");
}

export const connection = new Redis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: { rejectUnauthorized: false },
  retryStrategy: (times: number) => Math.min(times * 200, 5_000),
});

// ─── Job payload types (discriminated union) ──────────────────────────────────

export type EmailJobData =
  | { name: "waitlist.confirmation";  payload: { email: string } }
  | { name: "email.verification";     payload: { id: string; email: string } }
  | { name: "password.reset";         payload: { email: string; token: string } }
 

export type EmailJobName = EmailJobData["name"];

// ─── Queue ────────────────────────────────────────────────────────────────────

export const emailQueue = new Queue<EmailJobData>("emails", {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

// ─── Enqueue helpers ──────────────────────────────────────────────────────────
// One typed helper per job — callers never touch the queue directly

export const enqueue = async (job: EmailJobData): Promise<void> => {
  await emailQueue.add(job.name, job);
};

export const enqueueWaitlistConfirmation = (email: string) =>
  enqueue({ name: "waitlist.confirmation", payload: { email } });

export const enqueueEmailVerification = (id: string, email: string) =>
  enqueue({ name: "email.verification", payload: { id, email } });

export const enqueuePasswordReset = (email: string, token: string) =>
  enqueue({ name: "password.reset", payload: { email, token } });



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

        

        default: {
          // Exhaustiveness check — TS will error if a case is missing
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