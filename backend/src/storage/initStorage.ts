import fs from "node:fs";
import path from "node:path";
import { logger } from "../settings/logger.js";

export async function ensureStorageDirectory(): Promise<void> {
  const storageDir = "/app/storage";
  const isRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_NAME ||
    process.env.PORT
  );
  
  // Railway环境使用持久化存储
  if (isRailway) {
    logger.info(`Railway environment detected, ensuring storage directory: ${storageDir}`);
    
    // 等待Volume挂载并创建目录
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
          logger.info(`Created Railway storage directory: ${storageDir}`);
        }
        
        // 测试目录可写性
        const testFile = path.join(storageDir, '.storage-init-test');
        fs.writeFileSync(testFile, `init-test-${Date.now()}`);
        fs.unlinkSync(testFile);
        
        // 设置目录权限
        fs.chmodSync(storageDir, 0o755);
        logger.info(`Storage directory is ready: ${storageDir}`);
        
        return; // 成功，退出重试
      } catch (error) {
        logger.warn({ 
          err: error, 
          attempt, 
          maxAttempts: 10,
          storageDir 
        }, `Storage initialization attempt ${attempt} failed`);
        
        if (attempt === 10) {
          logger.error({ err: error }, `Failed to initialize storage directory after 10 attempts: ${storageDir}`);
          throw new Error(`Railway storage initialization failed: ${storageDir}`);
        }
        
        // 等待后重试，递增延迟
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  } else {
    logger.info(`Local environment detected, skipping Railway storage setup`);
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