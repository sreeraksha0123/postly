import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { config } from "@postly/shared";
import { orchestrationQueue } from "@postly/queues";
import { authRouter } from "./routes/auth";
import { campaignsRouter } from "./routes/campaigns";
import { analyticsRouter } from "./routes/analytics";
import { registry, httpRequestDuration } from "./metrics";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Basic per-request latency metric
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({ method: req.method });
  res.on("finish", () => end({ route: req.route?.path || req.path, status_code: res.statusCode }));
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok", env: config.env }));

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

// API docs
const openapiDoc = YAML.load(path.join(__dirname, "../openapi.yaml"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDoc));

// BullMQ job monitoring dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({ queues: [new BullMQAdapter(orchestrationQueue)], serverAdapter });
app.use("/admin/queues", serverAdapter.getRouter());

app.use("/api/auth", authRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/analytics", analyticsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "internal server error" });
});

app.listen(config.api.port, () => {
  console.log(`Postly API listening on :${config.api.port}`);
  console.log(`  docs:  http://localhost:${config.api.port}/docs`);
  console.log(`  queues: http://localhost:${config.api.port}/admin/queues`);
  console.log(`  metrics: http://localhost:${config.api.port}/metrics`);
});
