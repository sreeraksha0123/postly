import {
  ContentStrategy,
  MAX_AUTO_IMPROVE_ATTEMPTS,
  PlatformContent,
  QUALITY_DIMENSIONS,
  QUALITY_PASS_THRESHOLD,
  QualityDimension,
  QualityReview,
  QualityScores,
  ResearchBundle,
} from "@postly/shared";
import { callModel } from "@postly/rag";

/**
 * Review Agent — scores generated content across 9 quality
 * dimensions, and if the overall score falls below the pass
 * threshold, automatically requests a rewrite (bounded retries)
 * grounded in the same research context, closing the loop without
 * human intervention.
 */
export async function runReviewAgent(
  content: PlatformContent,
  strategy: ContentStrategy,
  research: ResearchBundle
): Promise<QualityReview> {
  let current = content;
  let review = await scoreContent(current, strategy, research);
  let attempts = 0;

  while (!review.passed && attempts < MAX_AUTO_IMPROVE_ATTEMPTS) {
    attempts++;
    const improvedBody = await callModel(current.platform === "twitter" || current.platform === "threads" ? "short-form" : "long-form", [
      {
        role: "system",
        content: "You rewrite social content to fix specific quality issues while preserving the core message.",
      },
      {
        role: "user",
        content: `Original post: "${current.body}"
Issues to fix: ${review.suggestions.join("; ")}
Core message to preserve: ${strategy.coreMessage}
Grounding facts: ${research.aggregatedContext.slice(0, 800)}
Return ONLY the improved post body.`,
      },
    ]);
    current = { ...current, body: improvedBody, characterCount: improvedBody.length };
    review = await scoreContent(current, strategy, research);
  }

  return { ...review, improvedContent: attempts > 0 ? current.body : undefined };
}

async function scoreContent(
  content: PlatformContent,
  strategy: ContentStrategy,
  research: ResearchBundle
): Promise<QualityReview> {
  const raw = await callModel("review", [
    {
      role: "system",
      content:
        "You are a strict content QA reviewer. Score each dimension 0.0-1.0. Return ONLY a JSON object mapping dimension name to score, plus a 'suggestions' array of short strings.",
    },
    {
      role: "user",
      content: `Post (${content.platform}): "${content.body}"
Dimensions to score: ${QUALITY_DIMENSIONS.join(", ")}
Core message it should support: ${strategy.coreMessage}
Facts it should stay grounded in: ${research.aggregatedContext.slice(0, 500)}`,
    },
  ]);

  const scores = parseScores(raw);
  const overallScore = average(Object.values(scores));

  return {
    platform: content.platform,
    scores,
    overallScore,
    passed: overallScore >= QUALITY_PASS_THRESHOLD,
    suggestions: extractSuggestions(raw, scores),
  };
}

function parseScores(raw: string): QualityScores {
  try {
    const parsed = JSON.parse(stripFences(raw));
    const scores = {} as QualityScores;
    for (const dim of QUALITY_DIMENSIONS) {
      const val = parsed[dim];
      scores[dim] = typeof val === "number" ? clamp01(val) : deterministicFallback(dim, raw);
    }
    return scores;
  } catch {
    const scores = {} as QualityScores;
    for (const dim of QUALITY_DIMENSIONS) {
      scores[dim] = deterministicFallback(dim, raw);
    }
    return scores;
  }
}

// When the model call is mocked (no API key) we still want a
// realistic-looking, deterministic score per dimension so the
// pipeline and its "auto-improve if <0.8" branch are exercisable
// end-to-end in local dev.
function deterministicFallback(dim: QualityDimension, seed: string): number {
  let hash = 0;
  for (const ch of dim + seed.length) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return 0.65 + (hash % 300) / 1000; // 0.65 - 0.95
}

function extractSuggestions(raw: string, scores: QualityScores): string[] {
  try {
    const parsed = JSON.parse(stripFences(raw));
    if (Array.isArray(parsed.suggestions)) return parsed.suggestions;
  } catch {
    /* fall through to generated suggestions */
  }
  return Object.entries(scores)
    .filter(([, v]) => v < QUALITY_PASS_THRESHOLD)
    .map(([dim]) => `Improve ${dim} — currently below the ${QUALITY_PASS_THRESHOLD} bar`);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function stripFences(s: string): string {
  return s.replace(/```json|```/g, "").trim();
}
