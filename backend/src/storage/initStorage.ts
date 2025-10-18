import fs from "node:fs";
import path from "node:path";
import { logger } from "../settings/logger.js";

export function ensureStorageDirectory(): void {
  const storageDir = "/app/storage";
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_VOLUME_MOUNT_PATH;
  
  // Railway环境使用持久化存储
  if (isRailway) {
    if (!fs.existsSync(storageDir)) {
      try {
        fs.mkdirSync(storageDir, { recursive: true });
        logger.info(`Created Railway storage directory: ${storageDir}`);
      } catch (error) {
        logger.error({ err: error }, `Failed to create storage directory: ${storageDir}`);
      }
    }
    
    // 设置目录权限
    try {
      fs.chmodSync(storageDir, 0o755);
      logger.info(`Set permissions for storage directory: ${storageDir}`);
    } catch (error) {
      logger.warn({ err: error }, `Failed to set directory permissions`);
    }
  }
}

export function checkStorageHealth(): boolean {
  const storageDir = "/app/storage";
  const testFile = path.join(storageDir, ".health-check");
  
  try {
    fs.writeFileSync(testFile, "health-check");
    const content = fs.readFileSync(testFile, "utf8");
    fs.unlinkSync(testFile);
    return content === "health-check";
  } catch (error) {
    logger.error({ err: error }, "Storage health check failed");
    return false;
  }
}