import { config } from "@postly/shared";

/**
 * Thin wrapper so the rest of the RAG system doesn't care which
 * embedding provider is behind it. Defaults to OpenAI's
 * text-embedding-3-small (1536 dims) since it's cheap and fast;
 * swap out `embed()` to point at any other provider.
 */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  dimensions = 1536;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      // Deterministic pseudo-embedding fallback for local dev / tests
      // without an API key. NOT for production use.
      return texts.map((t) => pseudoEmbed(t, this.dimensions));
    }
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
      }),
    });
    if (!res.ok) {
      throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}

function pseudoEmbed(text: string, dims: number): number[] {
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dims] += text.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return new OpenAIEmbeddingProvider(config.models.openaiKey);
}
