import "./settings/loadEnv.js";
import express from "express";
import cors from "cors";
import { createServer } from "http";

import { loadConfig } from "./settings/config.js";
import { logger } from "./settings/logger.js";
import { ensureMigrations } from "./storage/migrations.js";
import { poiRouter } from "./routes/poiRoutes.js";
import { createGaodeProxyRouter } from "./routes/gaodeProxy.js";
import { planningRouter } from "./routes/planningRoutes.js";

const config = loadConfig();

async function bootstrap(): Promise<void> {
  await ensureMigrations(config.databasePath);

  const app = express();

  app.use(cors());
  app.use("/_AMapService", createGaodeProxyRouter(config));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/status", (_req, res) => {
    res.json({
      service: "poi-location-scout-backend",
      status: "ok",
      version: config.version,
      provider: "gaode",
      cacheTtlHours: config.cacheTtlHours,
    });
  });

  app.use("/api/poi", poiRouter(config));
  app.use("/api/planning", planningRouter(config));

  const server = createServer(app);
  const host = "0.0.0.0";
  
  // 增加服务器超时时间，支持长时间运行的缓存刷新任务
  server.timeout = 300000; // 5分钟
  server.keepAliveTimeout = 65000; // 65秒
  server.headersTimeout = 66000; // 66秒
  
  server.listen(config.port, host, () => {
    logger.info(`Backend listening on http://${host}:${config.port}`);
    logger.info(`Server timeout configured: ${server.timeout}ms`);
  });
}

void bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to start backend service");
  process.exit(1);
});
