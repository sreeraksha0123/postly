import { Platform, PlatformContent, PublishResult } from "@postly/shared";

export interface PlatformClient {
  publish(content: PlatformContent): Promise<PublishResult>;
}

/**
 * Each client wraps the real platform API. Without a configured
 * token it returns a clearly-labeled simulated result instead of
 * throwing, so the whole pipeline (including BullMQ retry logic)
 * is exercisable in dev without live social accounts.
 */
class LinkedInClient implements PlatformClient {
  async publish(content: PlatformContent): Promise<PublishResult> {
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    if (!token) return simulate(content.platform);
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:organization:${process.env.LINKEDIN_CLIENT_ID}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: `${content.body}\n\n${content.hashtags.join(" ")}` },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (!res.ok) throw new Error(`LinkedIn publish failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return { platform: "linkedin", postId: data.id, publishedAt: new Date().toISOString() };
  }
}

class TwitterClient implements PlatformClient {
  async publish(content: PlatformContent): Promise<PublishResult> {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) return simulate(content.platform);
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${content.body} ${content.hashtags.join(" ")}`.slice(0, 280) }),
    });
    if (!res.ok) throw new Error(`Twitter publish failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    return { platform: "twitter", postId: data.data.id, publishedAt: new Date().toISOString(), url: `https://twitter.com/i/web/status/${data.data.id}` };
  }
}

class InstagramClient implements PlatformClient {
  async publish(content: PlatformContent): Promise<PublishResult> {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    if (!token || !igUserId) return simulate(content.platform);
    const createRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption: `${content.body}\n\n${content.hashtags.join(" ")}`,
        access_token: token,
      }),
    });
    if (!createRes.ok) throw new Error(`Instagram media create failed: ${createRes.status}`);
    const created: any = await createRes.json();
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: created.id, access_token: token }),
    });
    if (!publishRes.ok) throw new Error(`Instagram publish failed: ${publishRes.status}`);
    const published: any = await publishRes.json();
    return { platform: "instagram", postId: published.id, publishedAt: new Date().toISOString() };
  }
}

class ThreadsClient implements PlatformClient {
  async publish(content: PlatformContent): Promise<PublishResult> {
    const token = process.env.THREADS_ACCESS_TOKEN;
    if (!token) return simulate(content.platform);
    const res = await fetch("https://graph.threads.net/v1.0/me/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "TEXT",
        text: `${content.body}\n\n${content.hashtags.join(" ")}`,
        access_token: token,
      }),
    });
    if (!res.ok) throw new Error(`Threads publish failed: ${res.status}`);
    const data: any = await res.json();
    return { platform: "threads", postId: data.id, publishedAt: new Date().toISOString() };
  }
}

function simulate(platform: Platform): PublishResult {
  return {
    platform,
    postId: `sim_${platform}_${Date.now()}`,
    publishedAt: new Date().toISOString(),
    url: undefined,
  };
}

const clients: Record<Platform, PlatformClient> = {
  linkedin: new LinkedInClient(),
  twitter: new TwitterClient(),
  instagram: new InstagramClient(),
  threads: new ThreadsClient(),
};

export function getPlatformClient(platform: Platform): PlatformClient {
  return clients[platform];
}
