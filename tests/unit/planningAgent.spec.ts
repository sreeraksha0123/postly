import { runPlanningAgent } from "@postly/agents";
import { CampaignInput } from "@postly/shared";

describe("Planning Agent", () => {
  const input: CampaignInput = {
    userId: "00000000-0000-0000-0000-000000000001",
    name: "Launch week",
    idea: "We shipped fault-tolerant async pipelines for our AI agent platform",
    platforms: ["linkedin", "twitter", "instagram", "threads"],
  };

  it("produces a strategy with per-platform coverage for every requested platform", async () => {
    const strategy = await runPlanningAgent(input);
    expect(strategy.coreMessage).toBeTruthy();
    expect(strategy.targetAudience).toBeTruthy();
    for (const platform of input.platforms) {
      expect(strategy.platformStrategy[platform]).toBeTruthy();
    }
  });

  it("falls back to a sane default strategy if the model response isn't valid JSON", async () => {
    const strategy = await runPlanningAgent({ ...input, idea: "test fallback path" });
    expect(strategy.contentPillars.length).toBeGreaterThan(0);
  });
});
