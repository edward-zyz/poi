import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { logger } from "../settings/logger.js";

const MIGRATION_VERSION = 1;

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function ensureMigrations(databasePath: string): Promise<void> {
  ensureDir(databasePath);
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

    if (currentVersion >= MIGRATION_VERSION) {
      db.exec("COMMIT");
      return;
    }

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
