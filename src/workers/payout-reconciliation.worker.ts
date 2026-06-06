// src/workers/payout-reconciliation.worker.ts
import { Worker, type Job } from "bullmq";
import { Queue } from "bullmq";
import { connection } from "../utils/emailqueue.js";
import { reconcileStalePayouts } from "../services/payout.service.js";

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

export const reconciliationQueue = new Queue("payout-reconciliation", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 50 },
  },
});

// Schedule a repeating reconciliation job on startup
export const startReconciliationScheduler = async (): Promise<void> => {
  await reconciliationQueue.upsertJobScheduler(
    "reconcile-stale-payouts",
    { every: RECONCILE_INTERVAL_MS },
    {
      name: "reconcile",
      data: {},
    }
  );
};

export const startReconciliationWorker = (): Worker => {
  const worker = new Worker(
    "payout-reconciliation",
    async (_job: Job) => {
      await reconcileStalePayouts();
    },
    { connection, concurrency: 1 } // concurrency 1 — reconciliation must not run in parallel
  );

  worker.on("completed", () =>
    console.log("[reconcileWorker] ✓ Reconciliation pass completed")
  );

  worker.on("failed", (_job, err) =>
    console.error("[reconcileWorker] ✗ Reconciliation failed:", err.message)
  );

  return worker;
};