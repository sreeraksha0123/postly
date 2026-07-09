import { Platform, PlatformContent, PublishResult } from "@postly/shared";
import { getPlatformClient } from "@postly/integrations";

/**
 * Publishing Agent — pushes finalized (post-review) content live.
 * Individual platform failures don't take down the whole batch;
 * each is reported independently so the orchestrator/queue layer
 * can retry just the failed platform.
 */
export async function runPublishingAgent(
  content: Partial<Record<Platform, PlatformContent>>
): Promise<{ results: PublishResult[]; failures: { platform: Platform; error: string }[] }> {
  const results: PublishResult[] = [];
  const failures: { platform: Platform; error: string }[] = [];

  await Promise.all(
    Object.entries(content).map(async ([platform, c]) => {
      if (!c) return;
      try {
        const client = getPlatformClient(platform as Platform);
        results.push(await client.publish(c));
      } catch (err: any) {
        failures.push({ platform: platform as Platform, error: err.message || String(err) });
      }
    })
  );

  return { results, failures };
}
