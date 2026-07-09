# Performance Benchmarks

These are the numbers you should expect to *measure yourself* once real
model/platform credentials are wired in — they are not claimed results from
a live production deployment, since this environment has no external network
access to run one. Use `scripts/benchmark.js` as the harness; it hits
`POST /api/campaigns` N times and reports pipeline latency percentiles once
each campaign resolves to `published`/`failed`.

## What to measure

| Stage | What drives latency | How to reduce it |
|---|---|---|
| Planning | 1 LLM call | Smaller/faster model for strategy extraction |
| Research | Internal RAG query + 2 external API calls (web, news) | Run web/news in parallel (already done via `Promise.all`-equivalent in `retrieveMultiSource`); cache repeated topics |
| Generation | N parallel LLM calls (one per platform) | Already parallelized; bounded by the slowest single platform call |
| Review | Up to `1 + MAX_AUTO_IMPROVE_ATTEMPTS` (2) LLM calls per platform | Lower the auto-improve ceiling, or raise the pass threshold cautiously |
| Publishing | N parallel platform API calls | Already parallelized; bounded by the slowest platform's API latency |

## Queue throughput

With `QUEUE_CONCURRENCY=10` (the default), theoretical max throughput is
`10 campaigns / (end-to-end pipeline latency)`. If a full pipeline (2
platforms, no auto-improve needed) averages ~8-15s against real LLM APIs,
that's roughly 40-75 campaigns/minute per worker replica — scale replicas
horizontally (the Kubernetes HPA in `kubernetes/deployment.yaml` targets 75%
CPU, 3-15 replicas) rather than raising concurrency past what your Redis/DB
connection limits comfortably allow.

## Load-testing the API layer

```bash
npx autocannon -c 20 -d 30 -m GET http://localhost:4000/health
```

Use this to sanity-check the Express layer's own overhead (rate limiting,
JWT verification) independent of agent/model latency.
