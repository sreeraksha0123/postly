import { runGenerationAgent } from "@postly/agents";
import { ContentStrategy, ResearchBundle } from "@postly/shared";

describe("Generation Agent", () => {
  const strategy: ContentStrategy = {
    coreMessage: "Multi-agent orchestration reduces manual content ops",
    targetAudience: "Marketing leads",
    platformStrategy: {
      linkedin: "thought leadership",
      twitter: "punchy thread",
      instagram: "visual carousel",
      threads: "conversational",
    },
    contentPillars: [
      { name: "Automation", description: "less manual work", weight: 0.5 },
      { name: "Quality", description: "review agent catches issues", weight: 0.5 },
    ],
    toneGuidelines: "Confident, clear",
  };

  const research: ResearchBundle = {
    findings: [],
    aggregatedContext: "Teams report 40% time savings using agentic content pipelines.",
    sentimentScore: 0.5,
  };

  it("generates content for every requested platform in parallel, respecting char limits", async () => {
    const result = await runGenerationAgent(strategy, research, ["twitter", "linkedin"]);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(["twitter", "linkedin"]));
    expect(result.twitter!.body.length).toBeLessThanOrEqual(280);
    expect(result.linkedin!.body.length).toBeLessThanOrEqual(3000);
  });

  it("derives hashtags from content pillars", async () => {
    const result = await runGenerationAgent(strategy, research, ["instagram"]);
    expect(result.instagram!.hashtags.length).toBeGreaterThan(0);
    expect(result.instagram!.hashtags[0].startsWith("#")).toBe(true);
  });
});
