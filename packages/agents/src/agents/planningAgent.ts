import { CampaignInput, ContentStrategy, Platform } from "@postly/shared";
import { callModel } from "@postly/rag";

const PLATFORM_DEFAULT_STRATEGY: Record<Platform, string> = {
  linkedin: "Professional, insight-driven long-form post establishing thought leadership.",
  twitter: "Punchy, high-density thread or single tweet optimized for shares and replies.",
  instagram: "Visual-first caption pairing a strong hook with a carousel/reel concept.",
  threads: "Conversational, community-toned post inviting discussion.",
};

/**
 * Planning Agent — turns a raw idea into a structured content
 * strategy: core message, audience, per-platform angle, and
 * content pillars the Generation Agent will draft against.
 */
export async function runPlanningAgent(input: CampaignInput): Promise<ContentStrategy> {
  const prompt = `You are a content strategist. Given this idea: "${input.idea}"
Produce a JSON object with: coreMessage (1 sentence), targetAudience (1 sentence),
contentPillars (array of {name, description, weight} summing weight to 1.0, 2-4 items),
and toneGuidelines (1-2 sentences). Brand voice hint: ${input.brandVoice || "confident, clear, no fluff"}.
Respond with ONLY the JSON object, no markdown.`;

  const raw = await callModel("planning", [
    { role: "system", content: "You produce only valid JSON. No prose, no markdown fences." },
    { role: "user", content: prompt },
  ]);

  let parsed: Partial<ContentStrategy> = {};
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    // Model call was mocked or malformed — fall back to a sane default
    // so downstream agents always receive a well-formed strategy.
    parsed = {
      coreMessage: input.idea,
      targetAudience: "Professionals interested in this topic",
      contentPillars: [
        { name: "Insight", description: "Core takeaway from the idea", weight: 0.6 },
        { name: "Proof", description: "Evidence or example backing the insight", weight: 0.4 },
      ],
      toneGuidelines: input.brandVoice || "Confident, clear, no fluff.",
    };
  }

  const platformStrategy: Record<Platform, string> = {} as Record<Platform, string>;
  for (const p of input.platforms) {
    platformStrategy[p] = PLATFORM_DEFAULT_STRATEGY[p];
  }

  return {
    coreMessage: parsed.coreMessage || input.idea,
    targetAudience: parsed.targetAudience || "General audience",
    platformStrategy,
    contentPillars: parsed.contentPillars || [],
    toneGuidelines: parsed.toneGuidelines || "Clear and direct.",
  };
}

function stripFences(s: string): string {
  return s.replace(/```json|```/g, "").trim();
}
