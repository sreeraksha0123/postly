import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [registry],
});

export const campaignsProcessedCounter = new client.Counter({
  name: "postly_campaigns_processed_total",
  help: "Total campaigns processed by the orchestration pipeline",
  labelNames: ["status"],
  registers: [registry],
});

export const agentDurationHistogram = new client.Histogram({
  name: "postly_agent_duration_seconds",
  help: "Duration of individual agent executions",
  labelNames: ["agent"],
  registers: [registry],
});
