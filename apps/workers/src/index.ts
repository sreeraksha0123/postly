import { Worker } from "bullmq";
import { Pool } from "pg";
import cron from "node-cron";
import { config, QUEUE_NAMES } from "@postly/shared";
import { getRedisConnection, CampaignJobData } from "@postly/queues";
import { runLearningPass } from "@postly/agents";
import { processCampaignJob } from "./processor";

const pool = new Pool({ connectionString: config.database.url });

const worker = new Worker<CampaignJobData>(
  QUEUE_NAMES.ORCHESTRATION,
  async (job) => processCampaignJob(job, pool),
  {
    connection: getRedisConnection(),
    concurrency: config.queue.concurrency, // 10+ concurrent workers as required
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] campaign ${job.data.campaignId} completed (job ${job.id})`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[worker] campaign ${job?.data.campaignId} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`
  );
});

worker.on("error", (err) => {
  console.error("[worker] unexpected worker error:", err);
});

// Nightly self-learning pass over campaign performance data.
cron.schedule("0 3 * * *", async () => {
  console.log("[learning] running nightly learning pass...");
  try {
    await runLearningPass(pool);
    console.log("[learning] complete");
  } catch (err) {
    console.error("[learning] failed:", err);
  }
});

console.log(`Postly worker started. concurrency=${config.queue.concurrency} maxRetries=${config.queue.maxRetries}`);

process.on("SIGTERM", async () => {
  console.log("[worker] shutting down gracefully...");
  await worker.close();
  await pool.end();
  process.exit(0);
});
