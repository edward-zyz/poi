import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { logger } from "../settings/logger.js";

const MIGRATION_VERSION = 3;

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function ensureDirWithRetry(filePath: string, maxRetries: number = 5): Promise<void> {
  const dir = path.dirname(filePath);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 测试目录是否可写
      const testFile = path.join(dir, '.migration-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      return; // 成功，退出重试
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`Failed to create or access directory after ${maxRetries} attempts: ${dir}. Error: ${error}`);
      }
      
      // 等待后重试，递增延迟
      await new Promise(resolve => setTimeout(resolve, attempt * 200));
    }
  }
}

export async function ensureMigrations(databasePath: string): Promise<void> {
  // 确保数据库目录存在，等待Volume挂载完成
  await ensureDirWithRetry(databasePath);
  
  // 等待一小段时间确保文件系统同步
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const db = new Database(databasePath);
  try {
    db.pragma("journal_mode = WAL");
    db.exec("BEGIN");

    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const versionRow = db
      .prepare("SELECT value FROM metadata WHERE key = 'schema_version'")
      .get() as { value?: string } | undefined;
    const currentVersion = versionRow ? Number(versionRow.value) : 0;

    if (currentVersion < 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS poi_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT NOT NULL,
          city TEXT NOT NULL,
          poi_id TEXT NOT NULL,
          name TEXT,
          category TEXT,
          address TEXT,
          longitude REAL,
          latitude REAL,
          raw_json TEXT,
          fetch_source TEXT DEFAULT 'gaode',
          fetched_at INTEGER NOT NULL,
          UNIQUE(keyword, city, poi_id)
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS poi_aggregate (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city TEXT NOT NULL,
          keyword_set_hash TEXT NOT NULL,
          grid_id TEXT NOT NULL,
          poi_count INTEGER NOT NULL,
          radius INTEGER NOT NULL,
          payload TEXT,
          computed_at INTEGER NOT NULL,
          UNIQUE(city, keyword_set_hash, grid_id, radius)
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS poi_analysis_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city TEXT NOT NULL,
          keyword_set_hash TEXT NOT NULL,
          result_json TEXT NOT NULL,
          computed_at INTEGER NOT NULL,
          UNIQUE(city, keyword_set_hash)
        );
      `);
    }

    if (currentVersion < 2) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning_points (
          id TEXT PRIMARY KEY,
          city TEXT NOT NULL,
          name TEXT NOT NULL,
          longitude REAL NOT NULL,
          latitude REAL NOT NULL,
          radius_meters INTEGER NOT NULL,
          color TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_planning_points_city
        ON planning_points(city);
      `);
    }

    if (currentVersion < 3) {
      db.exec(`
        ALTER TABLE planning_points
        ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
      `);
      db.exec(`
        ALTER TABLE planning_points
        ADD COLUMN color_token TEXT NOT NULL DEFAULT 'pending';
      `);
      db.exec(`
        ALTER TABLE planning_points
        ADD COLUMN priority_rank INTEGER NOT NULL DEFAULT 100;
      `);
      db.exec(`
        ALTER TABLE planning_points
        ADD COLUMN notes TEXT DEFAULT '';
      `);
      db.exec(`
        ALTER TABLE planning_points
        ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';
      `);
      db.exec(`
        ALTER TABLE planning_points
        ADD COLUMN source_poi_id TEXT;
      `);
      db.exec(`
        ALTER TABLE planning_points
        ADD COLUMN updated_by TEXT;
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_planning_points_status
        ON planning_points(status);
      `);
    }

    db.prepare(
      `INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', ?)`
    ).run(String(MIGRATION_VERSION));

    db.exec("COMMIT");
    logger.info({ databasePath }, "SQLite migrations applied");
  } catch (error) {
    db.exec("ROLLBACK");
    logger.error({ err: error }, "SQLite migration failed");
    throw error;
  } finally {
    db.close();
  }
}
