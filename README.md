# Postly

Multi-agent AI content orchestration platform. Postly takes a raw idea and
autonomously plans, researches, drafts, quality-reviews, and publishes
platform-native content across LinkedIn, Twitter, Instagram, and Threads —
using a LangGraph agent graph, BullMQ for fault-tolerant async execution, and
a RAG pipeline for grounding.

## What's actually in this repo

This is a real, runnable codebase, not a mockup:

- **LangGraph orchestration** (`packages/agents`) — six agents (orchestrator,
  planning, research, generation, review, publishing) wired into a
  `StateGraph` with conditional routing and a quality gate before publishing.
- **BullMQ + Redis** (`packages/queues`, `apps/workers`) — real queues with
  5 retries, exponential backoff, 10+ concurrent workers, cron-based
  recurring campaigns, and a live job dashboard (Bull Board).
- **RAG** (`packages/rag`) — pgvector by default (zero extra infra), with a
  Pinecone adapter you can flip on via `.env`. Multi-source research
  (internal KB + web + news + lexicon sentiment).
- **9-dimension quality review with auto-improvement** — if a post scores
  below 0.8, the Review Agent automatically requests a bounded number of
  rewrites before handing off to Publishing.
- **Multi-model routing** — planning/long-form → Claude, short-form →
  GPT-4o, review → Gemini, so QA isn't graded by the same model family that
  wrote the content.
- Postgres schema, Docker Compose, Kubernetes manifests + HPA, GitHub
  Actions CI, Prometheus/Grafana, JWT auth + rate limiting, Jest tests.

### Honest scope notes

- **No API keys required to run it.** Every model call, web/news search, and
  platform publish falls back to a clearly-labeled mock/simulated response
  when a key isn't configured, so you can exercise the entire pipeline
  end-to-end locally before spending anything on real API calls.
- The self-learning system (`packages/agents/src/learning.ts`) is a real
  nightly job that mines `platform_posts`/`quality_checks`, but it writes
  distilled insights rather than fully closing the loop back into the
  Planning Agent's prompt automatically — that wiring is called out in
  `docs/ARCHITECTURE.md` as the natural next step.
- Kubernetes manifests assume you build/push `postly/api`, `postly/workers`,
  `postly/frontend` images yourself; there's no public registry here.

## Quick start (Docker Compose — recommended)

```bash
cp .env.example .env
# fill in whichever API keys you have; leave the rest blank to run in mock mode
docker compose -f docker/docker-compose.yml up --build
```

- API: http://localhost:4000 (health at `/health`)
- API docs (Swagger): http://localhost:4000/docs
- Job dashboard (Bull Board): http://localhost:4000/admin/queues
- Metrics: http://localhost:4000/metrics
- Frontend: http://localhost:3000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

## Quick start (local, no Docker)

Requires Node 18+, a local Postgres with the `pgvector` extension available,
and Redis.

```bash
npm install --workspaces --include-workspace-root
cp .env.example .env   # point DATABASE_URL / REDIS_HOST at your local services
npm run migrate         # applies infrastructure/database/migrations/*.sql

npm run dev:api        # terminal 1
npm run dev:workers    # terminal 2
npm run dev:frontend   # terminal 3
```

Everything runs directly from TypeScript source via `tsx` (dev and "production" alike) rather than a separate `tsc`-to-`dist` build step — see `docs/ARCHITECTURE.md` for why, given the monorepo's cross-package imports. Run `npm run typecheck` any time to type-check the whole workspace without emitting anything.

## Try it

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123","name":"You"}'
# -> { "token": "..." }

curl -X POST http://localhost:4000/api/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Launch post","idea":"Why async agent pipelines beat cron jobs","platforms":["linkedin","twitter"]}'
```

Watch it progress through the pipeline in the Bull Board dashboard, then:

```bash
curl http://localhost:4000/api/campaigns/<id> -H "Authorization: Bearer <token>"
```

## Repo layout

See `docs/ARCHITECTURE.md` for the full breakdown of the agent graph, queue
topology, and data flow, and `docs/API.md` for endpoint details beyond the
OpenAPI spec at `apps/api/openapi.yaml`.

## Testing

```bash
npm run test:unit          # agent logic in isolation
npm run test:integration   # full graph run in mock-model mode
```

## Environment variables

See `.env.example` — every var is documented inline, grouped by concern
(database, Redis/queues, model providers, vector store, platform
integrations, security, observability).
