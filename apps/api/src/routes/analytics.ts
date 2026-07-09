import { Router } from "express";
import { getQueueStats } from "@postly/queues";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get("/overview", async (req: AuthedRequest, res) => {
  const [campaignStats, queueStats, avgQuality] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*) FROM campaigns WHERE user_id = $1 GROUP BY status`,
      [req.user!.id]
    ),
    getQueueStats(),
    pool.query(
      `SELECT qc.platform, AVG((qc.scores->>'engagement')::float) as avg_engagement,
              AVG((qc.scores->>'accuracy')::float) as avg_accuracy
       FROM quality_checks qc
       JOIN campaigns c ON c.id = qc.campaign_id
       WHERE c.user_id = $1
       GROUP BY qc.platform`,
      [req.user!.id]
    ),
  ]);

  res.json({
    campaignsByStatus: Object.fromEntries(campaignStats.rows.map((r) => [r.status, parseInt(r.count, 10)])),
    queue: queueStats,
    qualityByPlatform: avgQuality.rows,
  });
});

analyticsRouter.get("/campaigns/:id/performance", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT platform, metrics, published_at FROM platform_posts
     WHERE campaign_id = $1 ORDER BY published_at`,
    [req.params.id]
  );
  res.json({ posts: rows });
});
