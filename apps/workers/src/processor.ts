import { Pool } from "pg";
import { buildPostlyGraph, GraphState } from "@postly/agents";
import { CampaignInput, Platform } from "@postly/shared";
import { Job } from "bullmq";
import { CampaignJobData } from "@postly/queues";

/**
 * Runs the full LangGraph pipeline for a campaign, streaming state
 * after each node (`app.stream`, not `app.invoke`) so we can persist
 * an `agent_executions` checkpoint row per step. If the worker
 * process crashes mid-campaign, the last completed step is visible
 * in Postgres and the campaign can be re-enqueued to resume — BullMQ
 * retries the whole job with exponential backoff (5 attempts by
 * default), while already-completed DB writes (content, reviews)
 * make the retry cheap since agents can short-circuit on existing data.
 */
export async function processCampaignJob(job: Job<CampaignJobData>, pool: Pool): Promise<void> {
  const { campaignId } = job.data;

  const { rows } = await pool.query("SELECT * FROM campaigns WHERE id = $1", [campaignId]);
  if (rows.length === 0) throw new Error(`campaign ${campaignId} not found`);
  const row = rows[0];

  const input: CampaignInput = {
    userId: row.user_id,
    name: row.name,
    idea: row.idea,
    platforms: row.platforms as Platform[],
    brandVoice: undefined,
  };

  const app = buildPostlyGraph();
  const initialState: GraphState = {
    campaignId,
    input,
    strategy: undefined,
    research: undefined,
    generatedContent: {},
    qualityReviews: {},
    status: "draft",
    errors: [],
    currentAgent: "orchestrator",
    retryCount: job.attemptsMade,
  };

  await setCampaignStatus(pool, campaignId, "planning");

  let finalState: GraphState = initialState;
  const stream = await app.stream(initialState);

  for await (const step of stream) {
    const [nodeName, nodeState] = Object.entries(step)[0] as [string, Partial<GraphState>];
    finalState = { ...finalState, ...nodeState };

    await job.updateProgress(progressForNode(nodeName));
    await checkpointAgentExecution(pool, campaignId, nodeName, nodeState);

    if (finalState.status === "failed") {
      await setCampaignStatus(pool, campaignId, "failed");
      throw new Error(`Pipeline failed at ${nodeName}: ${finalState.errors.join("; ")}`);
    }
  }

  await persistFinalState(pool, campaignId, finalState);
  await setCampaignStatus(pool, campaignId, finalState.status);
}

function progressForNode(node: string): number {
  const order = ["orchestratorAgent", "planningAgent", "researchAgent", "generationAgent", "reviewAgent", "publishingAgent"];
  const idx = order.indexOf(node);
  return idx === -1 ? 0 : Math.round(((idx + 1) / order.length) * 100);
}

async function setCampaignStatus(pool: Pool, campaignId: string, status: string) {
  await pool.query("UPDATE campaigns SET status = $1 WHERE id = $2", [status, campaignId]);
}

async function checkpointAgentExecution(
  pool: Pool,
  campaignId: string,
  nodeName: string,
  output: unknown
) {
  const agentType = nodeName.replace(/Agent$/, ""); // "planningAgent" -> "planning"
  const validTypes = ["orchestrator", "planning", "research", "generation", "review", "publishing"];
  if (!validTypes.includes(agentType)) return;
  await pool.query(
    `INSERT INTO agent_executions (campaign_id, agent_type, input, output, status, finished_at)
     VALUES ($1, $2, $3, $4, 'completed', NOW())`,
    [campaignId, agentType, JSON.stringify({}), JSON.stringify(output)]
  );
}

async function persistFinalState(pool: Pool, campaignId: string, state: GraphState) {
  await pool.query("UPDATE campaigns SET content = $1, quality_scores = $2 WHERE id = $3", [
    JSON.stringify(state.generatedContent),
    JSON.stringify(state.qualityReviews),
    campaignId,
  ]);

  for (const [platform, review] of Object.entries(state.qualityReviews)) {
    if (!review) continue;
    const content = state.generatedContent[platform as Platform];
    await pool.query(
      `INSERT INTO quality_checks (campaign_id, platform, content, dimensions, scores, suggestions, improved_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        campaignId,
        platform,
        content?.body || "",
        Object.keys(review.scores),
        JSON.stringify(review.scores),
        review.suggestions,
        review.improvedContent || null,
      ]
    );
  }

  if (state.status === "published") {
    for (const [platform, content] of Object.entries(state.generatedContent)) {
      if (!content) continue;
      await pool.query(
        `INSERT INTO platform_posts (campaign_id, platform, content, published_at)
         VALUES ($1, $2, $3, NOW())`,
        [campaignId, platform, content.body]
      );
    }
  }
}
