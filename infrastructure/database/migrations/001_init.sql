-- Postly initial schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  idea TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planning','researching','generating','reviewing','scheduled','publishing','published','failed')),
  platforms TEXT[] NOT NULL,
  schedule TIMESTAMPTZ,
  content JSONB DEFAULT '{}'::jsonb,
  quality_scores JSONB DEFAULT '{}'::jsonb,
  performance_metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL
    CHECK (agent_type IN ('orchestrator','planning','research','generation','review','publishing')),
  input JSONB,
  output JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','retrying')),
  retry_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_exec_campaign ON agent_executions(campaign_id);

-- 1536 dims matches OpenAI text-embedding-3-small; adjust if you swap providers.
CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(1536),
  source TEXT NOT NULL CHECK (source IN ('internal','web','news')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rag_documents_embedding
  ON rag_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS quality_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin','twitter','instagram','threads')),
  content TEXT NOT NULL,
  dimensions TEXT[] NOT NULL,
  scores JSONB NOT NULL,
  suggestions TEXT[],
  improved_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quality_checks_campaign ON quality_checks(campaign_id);

CREATE TABLE IF NOT EXISTS platform_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin','twitter','instagram','threads')),
  content TEXT NOT NULL,
  post_id TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_posts_campaign ON platform_posts(campaign_id);

CREATE TABLE IF NOT EXISTS learning_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  patterns JSONB,
  insights JSONB,
  strategies JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
