#!/usr/bin/env node
/**
 * Simple benchmark harness: creates N campaigns via the API, polls each
 * until it reaches a terminal status, and prints latency percentiles.
 *
 * Usage: node scripts/benchmark.js --count 10 --token <jwt> --url http://localhost:4000
 */
const args = require("minimist")(process.argv.slice(2));
const baseUrl = args.url || "http://localhost:4000";
const token = args.token;
const count = parseInt(args.count || "10", 10);

if (!token) {
  console.error("Usage: node scripts/benchmark.js --token <jwt> [--count 10] [--url http://localhost:4000]");
  process.exit(1);
}

async function createCampaign(i) {
  const res = await fetch(`${baseUrl}/api/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Benchmark campaign ${i}`,
      idea: `Benchmark idea number ${i} about async agent pipelines`,
      platforms: ["twitter", "linkedin"],
    }),
  });
  const data = await res.json();
  return data.campaign.id;
}

async function pollUntilDone(id, startedAt) {
  while (true) {
    const res = await fetch(`${baseUrl}/api/campaigns/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const status = data.campaign.status;
    if (status === "published" || status === "failed") {
      return { id, status, latencyMs: Date.now() - startedAt };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function main() {
  console.log(`Launching ${count} campaigns against ${baseUrl}...`);
  const started = Date.now();
  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push({ id: await createCampaign(i), startedAt: Date.now() });
  }

  const results = await Promise.all(ids.map((c) => pollUntilDone(c.id, c.startedAt)));
  const latencies = results.map((r) => r.latencyMs);
  const published = results.filter((r) => r.status === "published").length;

  console.log(`\nCompleted ${count} campaigns in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  published: ${published}/${count}`);
  console.log(`  p50 latency: ${percentile(latencies, 50)}ms`);
  console.log(`  p95 latency: ${percentile(latencies, 95)}ms`);
  console.log(`  max latency: ${Math.max(...latencies)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
