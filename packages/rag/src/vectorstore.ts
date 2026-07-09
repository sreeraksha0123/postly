import { Pool } from "pg";
import { config } from "@postly/shared";
import { EmbeddingProvider, getEmbeddingProvider } from "./embeddings";

export interface RagDocument {
  id?: string;
  content: string;
  metadata: Record<string, unknown>;
  source: "internal" | "web" | "news";
}

export interface RagMatch extends RagDocument {
  id: string;
  score: number;
}

export interface VectorStore {
  upsert(docs: RagDocument[]): Promise<void>;
  query(text: string, topK: number): Promise<RagMatch[]>;
}

/**
 * Default driver: Postgres + pgvector. Zero extra infra beyond the
 * Postgres instance already running in docker-compose — good enough
 * for most workloads and keeps local dev free of a Pinecone account.
 */
export class PgVectorStore implements VectorStore {
  private pool: Pool;
  private embeddings: EmbeddingProvider;

  constructor(pool: Pool, embeddings: EmbeddingProvider) {
    this.pool = pool;
    this.embeddings = embeddings;
  }

  async upsert(docs: RagDocument[]): Promise<void> {
    if (docs.length === 0) return;
    const vectors = await this.embeddings.embed(docs.map((d) => d.content));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const vec = `[${vectors[i].join(",")}]`;
        await client.query(
          `INSERT INTO rag_documents (content, metadata, embedding, source)
           VALUES ($1, $2, $3, $4)`,
          [d.content, JSON.stringify(d.metadata), vec, d.source]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async query(text: string, topK: number): Promise<RagMatch[]> {
    const [vector] = await this.embeddings.embed([text]);
    const vec = `[${vector.join(",")}]`;
    const { rows } = await this.pool.query(
      `SELECT id, content, metadata, source, 1 - (embedding <=> $1) AS score
       FROM rag_documents
       ORDER BY embedding <=> $1
       LIMIT $2`,
      [vec, topK]
    );
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      metadata: r.metadata,
      source: r.source,
      score: parseFloat(r.score),
    }));
  }
}

/**
 * Optional driver: Pinecone, for teams that want a fully managed
 * vector DB / need to scale past what pgvector comfortably handles.
 * Swap VECTOR_STORE_DRIVER=pinecone in .env to activate.
 */
export class PineconeVectorStore implements VectorStore {
  private embeddings: EmbeddingProvider;
  private indexName: string;
  private client: any;

  constructor(embeddings: EmbeddingProvider) {
    this.embeddings = embeddings;
    this.indexName = config.vectorStore.pineconeIndex;
  }

  private async getIndex() {
    if (!this.client) {
      const { Pinecone } = await import("@pinecone-database/pinecone");
      this.client = new Pinecone({ apiKey: config.vectorStore.pineconeKey });
    }
    return this.client.index(this.indexName);
  }

  async upsert(docs: RagDocument[]): Promise<void> {
    if (docs.length === 0) return;
    const vectors = await this.embeddings.embed(docs.map((d) => d.content));
    const index = await this.getIndex();
    await index.upsert(
      docs.map((d, i) => ({
        id: d.id || crypto.randomUUID(),
        values: vectors[i],
        metadata: { content: d.content, source: d.source, ...d.metadata },
      }))
    );
  }

  async query(text: string, topK: number): Promise<RagMatch[]> {
    const [vector] = await this.embeddings.embed([text]);
    const index = await this.getIndex();
    const res = await index.query({ vector, topK, includeMetadata: true });
    return (res.matches || []).map((m: any) => ({
      id: m.id,
      content: m.metadata?.content || "",
      metadata: m.metadata || {},
      source: (m.metadata?.source as any) || "internal",
      score: m.score || 0,
    }));
  }
}

let pool: Pool | null = null;
export function getVectorStore(): VectorStore {
  const embeddings = getEmbeddingProvider();
  if (config.vectorStore.driver === "pinecone") {
    return new PineconeVectorStore(embeddings);
  }
  if (!pool) {
    pool = new Pool({ connectionString: config.database.url });
  }
  return new PgVectorStore(pool, embeddings);
}
