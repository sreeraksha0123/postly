import { ContentStrategy, Platform, PlatformContent, ResearchBundle } from "@postly/shared";
import { callModel, ModelTask } from "@postly/rag";

const PLATFORM_CONSTRAINTS: Record<Platform, { maxChars: number; task: ModelTask; hashtagCount: number }> = {
  linkedin: { maxChars: 3000, task: "long-form", hashtagCount: 3 },
  twitter: { maxChars: 280, task: "short-form", hashtagCount: 2 },
  instagram: { maxChars: 2200, task: "long-form", hashtagCount: 8 },
  threads: { maxChars: 500, task: "short-form", hashtagCount: 2 },
};

/**
 * Generation Agent — drafts platform-specific content. Runs all
 * requested platforms in parallel (Promise.all) since each is an
 * independent generation, which is what the LangGraph node fans
 * out to under the hood.
 */
export async function runGenerationAgent(
  strategy: ContentStrategy,
  research: ResearchBundle,
  platforms: Platform[]
): Promise<Partial<Record<Platform, PlatformContent>>> {
  const entries = await Promise.all(
    platforms.map(async (platform) => [platform, await generateForPlatform(platform, strategy, research)] as const)
  );
  return Object.fromEntries(entries);
}

async function generateForPlatform(
  platform: Platform,
  strategy: ContentStrategy,
  research: ResearchBundle
): Promise<PlatformContent> {
  const constraints = PLATFORM_CONSTRAINTS[platform];
  const prompt = `Write a ${platform} post.
Core message: ${strategy.coreMessage}
Audience: ${strategy.targetAudience}
Tone: ${strategy.toneGuidelines}
Platform angle: ${strategy.platformStrategy[platform]}
Grounding context (use facts from here, don't invent stats): ${research.aggregatedContext.slice(0, 1500)}
Hard limit: under ${constraints.maxChars} characters.
Return ONLY the post body text, no hashtags line, no preamble.`;

  const body = await callModel(constraints.task, [
    { role: "system", content: `You are an expert ${platform} copywriter. Output only the post body.` },
    { role: "user", content: prompt },
  ]);

  const hashtags = deriveHashtags(strategy, constraints.hashtagCount);

  return {
    platform,
    body: body.slice(0, constraints.maxChars),
    hashtags,
    mediaPrompt: platform === "instagram" ? `Visual concept for: ${strategy.coreMessage}` : undefined,
    characterCount: body.length,
    modelUsed: constraints.task,
  };
}

function deriveHashtags(strategy: ContentStrategy, count: number): string[] {
  const words = strategy.contentPillars
    .map((p) => p.name.replace(/\s+/g, ""))
    .concat(strategy.coreMessage.split(" ").filter((w) => w.length > 5).slice(0, 3));
  return Array.from(new Set(words)).slice(0, count).map((w) => `#${w}`);
}
