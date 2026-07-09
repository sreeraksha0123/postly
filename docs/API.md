# API Reference

Full machine-readable spec: `apps/api/openapi.yaml` (served at `/docs`).

## Auth

All `/api/campaigns/*` and `/api/analytics/*` routes require
`Authorization: Bearer <jwt>`, obtained from `/api/auth/register` or
`/api/auth/login`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create a user, returns a JWT |
| POST | `/api/auth/login` | Returns a JWT |
| POST | `/api/campaigns` | Create a campaign and enqueue the agent pipeline |
| GET | `/api/campaigns` | List the caller's campaigns |
| GET | `/api/campaigns/:id` | Campaign detail: status, content, agent_executions, quality_checks, platform_posts |
| POST | `/api/campaigns/:id/retry` | Re-enqueue a failed campaign |
| POST | `/api/campaigns/:id/recurring` | Register a cron-style repeatable run (`{ "cron": "0 9 * * MON" }`) |
| GET | `/api/analytics/overview` | Campaign counts by status, queue depth, avg quality scores by platform |
| GET | `/api/analytics/campaigns/:id/performance` | Per-platform post metrics for one campaign |
| GET | `/health` | Liveness check |
| GET | `/metrics` | Prometheus exposition format |
| GET/* | `/admin/queues` | Bull Board job monitoring UI |

## Example: create + poll a campaign

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}' | jq -r .token)

CAMPAIGN=$(curl -s -X POST localhost:4000/api/campaigns \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Launch","idea":"Async agent pipelines beat cron jobs","platforms":["twitter","linkedin"]}')

ID=$(echo $CAMPAIGN | jq -r .campaign.id)

# poll until status is "published" or "failed"
watch -n 2 "curl -s localhost:4000/api/campaigns/$ID -H 'Authorization: Bearer $TOKEN' | jq .campaign.status"
```

A Postman collection covering the same flows is at
`docs/postly.postman_collection.json` — import it and set the
`baseUrl` and `token` collection variables.
