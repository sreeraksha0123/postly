import { Queue, QueueEvents } from "bullmq";
import { config, QUEUE_NAMES } from "@postly/shared";
import { getRedisConnection } from "./connection";

export interface CampaignJobData {
  campaignId: string;
}

const defaultJobOptions = {
  attempts: config.queue.maxRetries, // 5 retries by default
  backoff: {
    type: "exponential" as const,
    delay: config.queue.backoffMs,
  },
  removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 }, // keep 7 days for the dashboard
  removeOnFail: false, // keep failed jobs visible for inspection/manual retry
};

function makeQueue<T>(name: string) {
  return new Queue<T, unknown, string>(name, { connection: getRedisConnection(), defaultJobOptions });
}

export const orchestrationQueue = makeQueue<CampaignJobData>(QUEUE_NAMES.ORCHESTRATION);

/** Schedule a campaign to run its full agent pipeline at a future time (or now). */
export async function enqueueCampaign(campaignId: string, runAt?: Date) {
  const opts = runAt ? { delay: Math.max(0, runAt.getTime() - Date.now()) } : {};
  return orchestrationQueue.add("run-campaign", { campaignId }, opts);
}

/** Recurring campaigns: cron-style repeatable jobs. */
export async function scheduleRecurringCampaign(campaignId: string, cronPattern: string) {
  return orchestrationQueue.add(
    "run-campaign",
    { campaignId },
    { repeat: { pattern: cronPattern }, jobId: `recurring:${campaignId}` }
  );
}

export async function cancelRecurringCampaign(campaignId: string, cronPattern: string) {
  const repeatableJobs = await orchestrationQueue.getRepeatableJobs();
  const match = repeatableJobs.find((j) => j.id === `recurring:${campaignId}`);
  if (match) {
    await orchestrationQueue.removeRepeatableByKey(match.key);
  }
}

export function getQueueEvents() {
  return new QueueEvents(QUEUE_NAMES.ORCHESTRATION, { connection: getRedisConnection() });
}

/** Snapshot for the monitoring dashboard. */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    orchestrationQueue.getWaitingCount(),
    orchestrationQueue.getActiveCount(),
    orchestrationQueue.getCompletedCount(),
    orchestrationQueue.getFailedCount(),
    orchestrationQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}
