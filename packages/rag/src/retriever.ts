import { ResearchBundle, ResearchFinding } from "@postly/shared";
import { getVectorStore } from "./vectorstore";

/**
 * Multi-source research retriever. Grounds generation in real
 * material (internal knowledge base + live web/news) rather than
 * letting the generation agent hallucinate context, then produces
 * a lightweight sentiment read on the topic.
 */
export async function retrieveMultiSource(topic: string): Promise<ResearchBundle> {
  const findings: ResearchFinding[] = [];

  // 1. Internal knowledge (RAG over previously ingested docs / past campaigns)
  try {
    const store = getVectorStore();
    const matches = await store.query(topic, 5);
    if (matches.length > 0) {
      findings.push({
        source: "internal",
        summary: matches.map((m) => m.content).join(" \n"),
        citations: matches.map((m) => String(m.metadata?.url || m.id)),
        confidence: avg(matches.map((m) => m.score)),
      });
    }
  } catch (err) {
    // Non-fatal: internal KB may be empty on a fresh install.
    findings.push({
      source: "internal",
      summary: "No internal knowledge base entries matched this topic yet.",
      citations: [],
      confidence: 0,
    });
  }

  // 2. Web search
  const webFinding = await searchWeb(topic);
  findings.push(webFinding);

  // 3. News
  const newsFinding = await searchNews(topic);
  findings.push(newsFinding);

  // 4. Sentiment analysis over the aggregated context
  const aggregatedContext = findings.map((f) => f.summary).join("\n\n");
  const sentimentScore = estimateSentiment(aggregatedContext);
  findings.push({
    source: "sentiment",
    summary: `Aggregate sentiment score: ${sentimentScore.toFixed(2)} (-1 negative to +1 positive)`,
    citations: [],
    confidence: 0.6,
  });

  return { findings, aggregatedContext, sentimentScore };
}

async function searchWeb(topic: string): Promise<ResearchFinding> {
  const key = process.env.SEARCH_API_KEY;
  if (!key) {
    return {
      source: "web",
      summary: `Web search unavailable (no SEARCH_API_KEY configured). Configure a provider (Brave/Bing/SerpAPI) in .env to enable live web grounding for "${topic}".`,
      citations: [],
      confidence: 0,
    };
  }
  try {
    // Provider-agnostic placeholder call — swap the URL/headers for
    // whichever search API key you configure (Brave Search shown here).
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(topic)}`,
      { headers: { "X-Subscription-Token": key } }
    );
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    const data: any = await res.json();
    const results = (data.web?.results || []).slice(0, 5);
    return {
      source: "web",
      summary: results.map((r: any) => r.description).join(" \n"),
      citations: results.map((r: any) => r.url),
      confidence: results.length > 0 ? 0.8 : 0.2,
    };
  } catch (err: any) {
    return {
      source: "web",
      summary: `Web search failed: ${err.message}`,
      citations: [],
      confidence: 0,
    };
  }
}

async function searchNews(topic: string): Promise<ResearchFinding> {
  const key = process.env.NEWS_API_KEY;
  if (!key) {
    return {
      source: "news",
      summary: `News search unavailable (no NEWS_API_KEY configured).`,
      citations: [],
      confidence: 0,
    };
  }
  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&pageSize=5&apiKey=${key}`
    );
    if (!res.ok) throw new Error(`news search failed: ${res.status}`);
    const data: any = await res.json();
    const articles = data.articles || [];
    return {
      source: "news",
      summary: articles.map((a: any) => a.description || a.title).join(" \n"),
      citations: articles.map((a: any) => a.url),
      confidence: articles.length > 0 ? 0.75 : 0.2,
    };
  } catch (err: any) {
    return {
      source: "news",
      summary: `News search failed: ${err.message}`,
      citations: [],
      confidence: 0,
    };
  }
}

/** Lightweight lexicon-based sentiment scorer (no external call needed). */
function estimateSentiment(text: string): number {
  const positive = ["growth", "innovative", "success", "breakthrough", "excited", "opportunity", "win"];
  const negative = ["decline", "failure", "risk", "controversy", "concern", "backlash", "loss"];
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of positive) if (lower.includes(w)) score += 1;
  for (const w of negative) if (lower.includes(w)) score -= 1;
  return Math.max(-1, Math.min(1, score / 5));
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
