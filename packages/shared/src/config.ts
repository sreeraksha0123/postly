export const config = {
  env: process.env.NODE_ENV || "development",
  api: {
    port: parseInt(process.env.API_PORT || "4000", 10),
  },
  database: {
    url: process.env.DATABASE_URL || "postgresql://postly:postly@localhost:5432/postly",
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || "10", 10),
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || "5", 10),
    backoffMs: parseInt(process.env.QUEUE_BACKOFF_MS || "2000", 10),
  },
  models: {
    openaiKey: process.env.OPENAI_API_KEY || "",
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    googleKey: process.env.GOOGLE_AI_API_KEY || "",
    defaultProvider: (process.env.DEFAULT_MODEL_PROVIDER || "anthropic") as
      | "anthropic"
      | "openai"
      | "google",
  },
  vectorStore: {
    driver: (process.env.VECTOR_STORE_DRIVER || "pgvector") as "pgvector" | "pinecone",
    pineconeKey: process.env.PINECONE_API_KEY || "",
    pineconeIndex: process.env.PINECONE_INDEX || "postly-rag",
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  },
  observability: {
    sentryDsn: process.env.SENTRY_DSN || "",
    metricsPort: parseInt(process.env.PROMETHEUS_METRICS_PORT || "9100", 10),
  },
};

export const QUEUE_NAMES = {
  PLANNING: "postly-planning",
  RESEARCH: "postly-research",
  GENERATION: "postly-generation",
  REVIEW: "postly-review",
  PUBLISHING: "postly-publishing",
  ORCHESTRATION: "postly-orchestration",
} as const;
