import "./settings/loadEnv.js";
import express from "express";
import cors from "cors";
import { createServer } from "http";

import { loadConfig } from "./settings/config.js";
import { logger } from "./settings/logger.js";
import { ensureMigrations } from "./storage/migrations.js";
import { ensureStorageDirectory, checkStorageHealth } from "./storage/initStorage.js";
import { poiRouter } from "./routes/poiRoutes.js";
import { createGaodeProxyRouter } from "./routes/gaodeProxy.js";
import { planningRouter } from "./routes/planningRoutes.js";

const config = loadConfig();

async function bootstrap(): Promise<void> {
  const isRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_NAME ||
    process.env.PORT
  );
  
  // 确保存储目录存在（Railway环境）- 异步等待Volume挂载
  await ensureStorageDirectory();
  
  // 检查存储健康状态
  if (isRailway && !checkStorageHealth()) {
    logger.error("Railway storage health check failed - POI cache may not persist");
    throw new Error("Railway storage health check failed");
  }
  
  // 运行数据库迁移
  logger.info({ databasePath: config.databasePath, isRailway }, "Starting database migrations");
  await ensureMigrations(config.databasePath);

  const app = express();

  app.use(cors());
  app.use("/_AMapService", createGaodeProxyRouter(config));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/status", (_req, res) => {
    const isRailway = Boolean(
      process.env.RAILWAY_ENVIRONMENT || 
      process.env.RAILWAY_VOLUME_MOUNT_PATH ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_NAME ||
      process.env.PORT
    );
    
    // 检查Volume状态
    let volumeStatus = "not-applicable";
    if (isRailway) {
      try {
        const fs = require("node:fs");
        const dbExists = fs.existsSync(config.databasePath);
        const storageExists = fs.existsSync("/mnt/data");
        volumeStatus = dbExists ? "mounted-with-data" : (storageExists ? "mounted-empty" : "not-mounted");
      } catch (error) {
        volumeStatus = "error";
      }
    }
    
    res.json({
      service: "poi-location-scout-backend",
      status: "ok",
      version: config.version,
      provider: "gaode",
      cacheTtlHours: config.cacheTtlHours,
      databasePath: config.databasePath,
      storageType: isRailway ? "persistent-volume" : "local-filesystem",
      environment: isRailway ? "railway" : "local",
      railwayEnv: process.env.RAILWAY_ENVIRONMENT,
      railwayVolume: process.env.RAILWAY_VOLUME_MOUNT_PATH,
      railwayProjectId: process.env.RAILWAY_PROJECT_ID,
      railwayServiceName: process.env.RAILWAY_SERVICE_NAME,
      volumeStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // Railway Volume诊断端点
  app.get("/api/diagnose-volume", (_req, res) => {
    const isRailway = Boolean(
      process.env.RAILWAY_ENVIRONMENT || 
      process.env.RAILWAY_VOLUME_MOUNT_PATH ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_NAME ||
      process.env.PORT
    );

    const diagnosis = {
      isRailway,
      environment: process.env.NODE_ENV,
      railwayEnv: process.env.RAILWAY_ENVIRONMENT,
      railwayVolume: process.env.RAILWAY_VOLUME_MOUNT_PATH,
      railwayProjectId: process.env.RAILWAY_PROJECT_ID,
      railwayServiceName: process.env.RAILWAY_SERVICE_NAME,
      port: process.env.PORT,
      databasePath: config.databasePath,
      storageChecks: {
        storageDirExists: false,
        databaseExists: false,
        storageWritable: false,
        storageFiles: [] as string[],
        databaseSize: 0,
        databaseModified: null as Date | null
      },
      errors: [] as string[]
    };

    if (isRailway) {
      try {
        const fs = require("node:fs");
        
        // 检查/mnt/data目录
        diagnosis.storageChecks.storageDirExists = fs.existsSync("/mnt/data");
        
        // 检查数据库文件
        diagnosis.storageChecks.databaseExists = fs.existsSync(config.databasePath);
        
        // 检查目录权限
        if (diagnosis.storageChecks.storageDirExists) {
          try {
            const testFile = "/mnt/data/.diagnosis-test";
            fs.writeFileSync(testFile, `diagnosis-${Date.now()}`);
            fs.unlinkSync(testFile);
            diagnosis.storageChecks.storageWritable = true;
          } catch (error) {
            diagnosis.storageChecks.storageWritable = false;
            diagnosis.errors.push(`Storage not writable: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          // 列出目录内容
          try {
            const files = fs.readdirSync("/mnt/data");
            diagnosis.storageChecks.storageFiles = files;
          } catch (error) {
            diagnosis.errors.push(`Cannot list storage directory: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        // 检查数据库大小
        if (diagnosis.storageChecks.databaseExists) {
          try {
            const stats = fs.statSync(config.databasePath);
            diagnosis.storageChecks.databaseSize = stats.size;
            diagnosis.storageChecks.databaseModified = stats.mtime;
          } catch (error) {
            diagnosis.errors.push(`Cannot get database stats: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
      } catch (error) {
        diagnosis.errors.push(`Diagnosis failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      diagnosis.errors.push("Not running on Railway");
    }

    res.json({
      timestamp: new Date().toISOString(),
      diagnosis,
      summary: {
        healthy: diagnosis.errors.length === 0 && diagnosis.storageChecks.storageWritable,
        volumeReady: diagnosis.storageChecks.storageDirExists && diagnosis.storageChecks.storageWritable,
        databaseReady: diagnosis.storageChecks.databaseExists
      }
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
