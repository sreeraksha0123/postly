import { runReviewAgent } from "@postly/agents";
import { ContentStrategy, PlatformContent, ResearchBundle } from "@postly/shared";

describe("Review Agent", () => {
  const strategy: ContentStrategy = {
    coreMessage: "Async pipelines beat cron jobs for AI agents",
    targetAudience: "Backend engineers",
    platformStrategy: { linkedin: "thought leadership", twitter: "punchy", instagram: "visual", threads: "conversational" },
    contentPillars: [{ name: "Reliability", description: "retries and checkpoints", weight: 1 }],
    toneGuidelines: "Confident, technical, no fluff",
  };

  const research: ResearchBundle = {
    findings: [],
    aggregatedContext: "BullMQ supports exponential backoff and job retries.",
    sentimentScore: 0.4,
  };

  const content: PlatformContent = {
    platform: "linkedin",
    body: "Cron jobs are brittle. Async pipelines with retries are the future.",
    hashtags: ["#Backend"],
    characterCount: 68,
    modelUsed: "long-form",
  };

  it("returns a review with all 9 quality dimensions scored between 0 and 1", async () => {
    const review = await runReviewAgent(content, strategy, research);
    expect(Object.keys(review.scores)).toHaveLength(9);
    for (const score of Object.values(review.scores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    expect(typeof review.overallScore).toBe("number");
  });

  it("marks passed=true only when overallScore >= 0.8", async () => {
    const review = await runReviewAgent(content, strategy, research);
    expect(review.passed).toBe(review.overallScore >= 0.8);
  });
});
