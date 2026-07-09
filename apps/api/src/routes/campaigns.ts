import { Router } from "express";
import { CampaignInputSchema } from "@postly/shared";
import { enqueueCampaign, scheduleRecurringCampaign } from "@postly/queues";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

campaignsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = CampaignInputSchema.safeParse({ ...req.body, userId: req.user!.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const input = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO campaigns (user_id, name, idea, status, platforms, schedule)
     VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING *`,
    [input.userId, input.name, input.idea, input.platforms, input.scheduledAt || null]
  );
  const campaign = rows[0];

  const job = await enqueueCampaign(campaign.id, input.scheduledAt ? new Date(input.scheduledAt) : undefined);
  res.status(201).json({ campaign, jobId: job.id });
});

campaignsRouter.post("/:id/recurring", async (req: AuthedRequest, res) => {
  const { cron } = req.body || {};
  if (!cron) return res.status(400).json({ error: "cron pattern required, e.g. '0 9 * * MON'" });
  await scheduleRecurringCampaign(req.params.id, cron);
  res.status(202).json({ message: "recurring schedule created", cron });
});

campaignsRouter.get("/", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
    [req.user!.id]
  );
  res.json({ campaigns: rows });
});

campaignsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query("SELECT * FROM campaigns WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.user!.id,
  ]);
  if (rows.length === 0) return res.status(404).json({ error: "not found" });

  const [executions, qualityChecks, posts] = await Promise.all([
    pool.query("SELECT * FROM agent_executions WHERE campaign_id = $1 ORDER BY started_at", [req.params.id]),
    pool.query("SELECT * FROM quality_checks WHERE campaign_id = $1 ORDER BY created_at", [req.params.id]),
    pool.query("SELECT * FROM platform_posts WHERE campaign_id = $1 ORDER BY created_at", [req.params.id]),
  ]);

  res.json({
    campaign: rows[0],
    agentExecutions: executions.rows,
    qualityChecks: qualityChecks.rows,
    platformPosts: posts.rows,
  });
});

campaignsRouter.post("/:id/retry", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query("SELECT id FROM campaigns WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.user!.id,
  ]);
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  const job = await enqueueCampaign(req.params.id);
  res.status(202).json({ message: "requeued", jobId: job.id });
});
