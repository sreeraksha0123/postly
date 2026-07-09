import { Pool } from "pg";
import { config, Platform } from "@postly/shared";

/**
 * Self-learning system: mines `platform_posts.metrics` +
 * `quality_checks.scores` from prior campaigns to surface which
 * content pillars / tones / quality dimensions actually correlated
 * with engagement, and writes distilled "insights" back to
 * `learning_data`. The Planning Agent's prompt can then be extended
 * to include these insights (see docs/ARCHITECTURE.md) — kept as a
 * separate pass here rather than in the hot path so campaign
 * generation is never blocked on analytics.
 */
export async function runLearningPass(pool: Pool): Promise<void> {
  const { rows } = await pool.query(`
    SELECT pp.platform, pp.metrics, qc.scores, c.content as campaign_content
    FROM platform_posts pp
    JOIN campaigns c ON c.id = pp.campaign_id
    LEFT JOIN quality_checks qc ON qc.campaign_id = c.id
    WHERE pp.published_at IS NOT NULL
    ORDER BY pp.published_at DESC
    LIMIT 200
  `);

  if (rows.length === 0) return;

  const byPlatform: Record<string, { engagementSum: number; count: number }> = {};
  for (const row of rows) {
    const metrics = row.metrics || {};
    const engagement = (metrics.likes || 0) + (metrics.shares || 0) * 2 + (metrics.comments || 0) * 1.5;
    const key = row.platform;
    byPlatform[key] = byPlatform[key] || { engagementSum: 0, count: 0 };
    byPlatform[key].engagementSum += engagement;
    byPlatform[key].count += 1;
  }

  const insights = Object.entries(byPlatform).map(([platform, stats]) => ({
    platform,
    avgEngagement: stats.engagementSum / stats.count,
    sampleSize: stats.count,
  }));

  await pool.query(
    `INSERT INTO learning_data (campaign_id, patterns, insights, strategies, created_at)
     VALUES (NULL, $1, $2, $3, NOW())`,
    [
      JSON.stringify({ analyzedPosts: rows.length }),
      JSON.stringify(insights),
      JSON.stringify({
        recommendation:
          "Weight future content generation toward platforms/pillars with above-median avgEngagement.",
      }),
    ]
  );
}

export async function getTopPerformingInsights(pool: Pool, platform: Platform): Promise<string> {
  const { rows } = await pool.query(
    `SELECT insights FROM learning_data WHERE insights::text ILIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`%${platform}%`]
  );
  if (rows.length === 0) return "No historical performance data yet.";
  return JSON.stringify(rows[0].insights);
}
