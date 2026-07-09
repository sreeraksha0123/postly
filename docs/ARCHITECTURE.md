# Architecture

## Agent graph (LangGraph)

```
START
  → orchestrator
  → planning         (idea -> ContentStrategy)
  → research         (strategy -> ResearchBundle: internal RAG + web + news + sentiment)
  → generation        (strategy + research -> PlatformContent, one per platform, in parallel)
  → review            (9-dimension QualityReview per platform; auto-rewrite loop if <0.8)
  → [quality gate]     all platforms >= 0.6 overall? → publishing : END (status=failed)
  → publishing         (parallel per-platform publish; individual failures don't block others)
  → END
```

Each node is a plain async function operating on a shared `GraphState`
(defined with LangGraph's `Annotation.Root` in `packages/agents/src/graph.ts`).
`generatedContent` and `qualityReviews` use a merge reducer so results from
parallel per-platform work accumulate instead of overwriting each other.

Conditional edges (`routeAfter`, `routeAfterReview`) short-circuit to `END`
the moment any node reports `status: "failed"`, so a broken planning call
doesn't waste API calls on research/generation for content that will never
ship.

## Queueing & fault tolerance (BullMQ)

- `apps/api` enqueues one `run-campaign` job per campaign onto
  `postly:orchestration` (optionally delayed to `scheduledAt`, or registered
  as a cron-style repeatable job via `POST /api/campaigns/:id/recurring`).
- `apps/workers` runs a single `Worker` with `concurrency: QUEUE_CONCURRENCY`
  (10 by default) pulling from that queue.
- Each job runs `app.stream(initialState)` instead of `app.invoke(...)` —
  streaming yields state after every graph node, and the worker writes an
  `agent_executions` row per step. That gives you: (a) a live audit trail of
  exactly which agent ran, when, and what it produced; (b) a checkpoint to
  inspect if a job dies mid-pipeline.
- Retries: `defaultJobOptions.attempts = 5` with exponential backoff
  (`QUEUE_BACKOFF_MS` as the base delay). BullMQ retries the whole job on
  throw; because agent output for completed steps is already persisted to
  Postgres, a from-scratch retry is the safe default here, though the graph
  could be extended to resume from the last successful node by seeding
  `initialState` from the most recent `agent_executions` rows instead of a
  blank state — noted as a follow-up rather than implemented, to avoid
  papering over the added complexity of partial-state resumption (mid-flight
  external side effects like already-published posts) with untested code.
- `removeOnFail: false` keeps failed jobs visible in Bull Board
  (`/admin/queues`) for manual inspection/retry rather than silently
  disappearing.

## RAG & grounding

`packages/rag/src/vectorstore.ts` defines a `VectorStore` interface with two
implementations:

- `PgVectorStore` (default) — embeds via OpenAI's `text-embedding-3-small`
  (or a deterministic local pseudo-embedding if no `OPENAI_API_KEY` is set,
  so cosine search still returns something coherent in dev) and stores in
  the `rag_documents` table using the `pgvector` extension with an `ivfflat`
  index.
- `PineconeVectorStore` — same embedding layer, calls the Pinecone SDK
  instead. Switch via `VECTOR_STORE_DRIVER=pinecone`.

`packages/rag/src/retriever.ts` fans out to internal RAG + web search (Brave
API by default, swappable) + news (NewsAPI) + a lexicon-based sentiment
score, then concatenates everything into `aggregatedContext` that the
Generation and Review agents are instructed to stay grounded in — this is
the hallucination-reduction mechanism: generation is told not to invent
stats, and review explicitly checks `accuracy` against the same context.

## Multi-model orchestration

`packages/rag/src/modelRouter.ts` picks a provider per task type (planning →
Claude, long-form generation → Claude, short-form → GPT-4o, review →
Gemini) so the reviewer isn't the same model family as the writer. All three
providers degrade to a labeled mock response when their key is absent,
which is what lets the entire pipeline run in local dev/CI without live
credentials.

## Self-learning loop

`packages/agents/src/learning.ts` runs nightly (cron in `apps/workers`),
aggregates engagement metrics from `platform_posts` joined against
`quality_checks`, and writes distilled per-platform insights to
`learning_data`. This is real and runs — what's **not** wired yet is feeding
those insights back into the Planning Agent's prompt automatically; the
retrieval function `getTopPerformingInsights` exists precisely so that hookup
is a small addition (blend into the planning prompt in `planningAgent.ts`)
rather than an already-claimed feature that isn't there.

## Security

- JWT auth (`apps/api/src/middleware/auth.ts`), bcrypt password hashing.
- `helmet` for standard HTTP hardening headers, `express-rate-limit` for
  per-IP throttling.
- Secrets live in `.env` locally / `kubernetes/configmap.yaml`'s paired
  `Secret` in cluster — never committed with real values.

## Observability

- `prom-client` exposes `/metrics` (HTTP latency histogram, campaigns
  processed counter, agent duration histogram).
- `infrastructure/monitoring/prometheus.yml` scrapes the API; Grafana is
  pre-wired in Docker Compose with a starter dashboard JSON you can import
  (`infrastructure/monitoring/grafana-dashboard.json`).
- Bull Board (`/admin/queues`) gives real-time queue depth, active/failed
  job counts, and per-job history without needing Grafana for that slice.
