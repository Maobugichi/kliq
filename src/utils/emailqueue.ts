import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { sendWaitlistConfirmationEmail } from "./mailer.util.js";


if (!process.env.UPSTASH_REDIS_URL) {
    throw new Error("UPSTASH_REDIS_URL is not set. Add to .env file");
}

const connection = new Redis(process.env.UPSTASH_REDIS_URL, {
        maxRetriesPerRequest:null,
        tls:{
            rejectUnauthorized:false
        },
        retryStrategy: (times:number) => Math.min(times * 200, 5_000)
});

connection.on("connect",      () => console.log("[redis] ✓ Connected to Upstash"));
connection.on("ready",        () => console.log("[redis] ✓ Ready to accept commands"));
connection.on("error",        (err) => console.error("[redis] ✗ Error:", err.message));
connection.on("close",        () => console.warn("[redis] Connection closed"));
connection.on("reconnecting", () => console.warn("[redis] Reconnecting..."));

export interface WaitlistConfirmationJob {
    email:string;
}

export type EmailJobData = WaitlistConfirmationJob;

export type EmailJobName = "waitlist.confirmation";

export const emailQueue = new Queue<EmailJobData>("emails", {
    connection,
    defaultJobOptions:{
        attempts:4,
        backoff:{ type:"exponential", delay:5_000 },
        removeOnComplete:{ count:200 },
        removeOnFail: {count: 500 }
    }
});

export const enqueueWaitlistConfirmation = async (email:string):Promise<void> => {
    await emailQueue.add("waitlist.confirmation", { email });
}

export const startEmailWorker = ():Worker<EmailJobData> => {
    console.log("[emailWorker] Starting worker...");  // add this
    const worker = new Worker<EmailJobData>(
        "emails",
        async (job:Job<EmailJobData>) => {
             if (job.name === "waitlist.confirmation")  {
                const { email } = job.data as WaitlistConfirmationJob;
                console.log(`[emailWorker] Sending confirmation to ${email}`);
                await sendWaitlistConfirmationEmail(email);
                return;
            }

            throw new Error(`Unknown email job: ${job.name}`);
        },
        {
            connection,
            concurrency:5
        }
       
    );

    worker.on("completed", (job) => {
        console.log(`[emailWorker] ✓ job ${job.id} (${job.name}) completed`);
  });
 
  worker.on("failed", (job, err) => {
    console.error(`[emailWorker] ✗ job ${job?.id} (${job?.name}) failed:`, err.message);
  });
  
  return worker;
}

export const handleEmailWebhook = async (
    event:EmailWebhookEvent
): Promise<void> => {
    switch (event.type) {
        case "email.delivered":
            console.log(`[webhook] Delivered → ${event.email}`);
        break;

        case "email.bounced":
            console.warn(`[webhook] Bounced → ${event.email}. Suppressing future sends.`);
       
        break;
    
        case "email.complained": 
        console.warn(`[webhook] Spam complaint → ${event.email}`);
       
        break;
    
        default:
        console.log(`[webhook] Unhandled event type: ${(event as EmailWebhookEvent).type}`);

        }
}


export interface EmailWebhookEvent {
  type: "email.delivered" | "email.bounced" | "email.complained";
  email: string;
  timestamp: string;
  [key: string]: unknown; // provider-specific extra fields
}
