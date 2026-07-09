import { runCampaignGraph } from "@postly/agents";
import { CampaignInput } from "@postly/shared";

describe("Full campaign orchestration graph (integration, mock-model mode)", () => {
  const input: CampaignInput = {
    userId: "00000000-0000-0000-0000-000000000001",
    name: "Integration test campaign",
    idea: "Fault-tolerant pipelines let AI agents recover from failure automatically",
    platforms: ["twitter", "linkedin"],
  };

  it("runs planning -> research -> generation -> review -> publishing and reaches a terminal status", async () => {
    const result = await runCampaignGraph("test-campaign-id", input);
    expect(["published", "failed"]).toContain(result.status);
    expect(result.strategy).toBeDefined();
    expect(result.research).toBeDefined();
    expect(Object.keys(result.generatedContent).length).toBeGreaterThan(0);
  }, 30000);

  it("produces quality reviews for every platform that was generated", async () => {
    const result = await runCampaignGraph("test-campaign-id-2", input);
    for (const platform of Object.keys(result.generatedContent)) {
      expect(result.qualityReviews[platform as keyof typeof result.qualityReviews]).toBeDefined();
    }
  }, 30000);
});
