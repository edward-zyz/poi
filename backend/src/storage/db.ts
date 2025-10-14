import Database from "better-sqlite3";

const connectionPool = new Map<string, Database.Database>();

export function getConnection(databasePath: string): Database.Database {
  const existing = connectionPool.get(databasePath);
  if (existing) {
    return existing;
  }
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  connectionPool.set(databasePath, db);
  return db;
}

export function closeConnection(databasePath: string): void {
  const db = connectionPool.get(databasePath);
  if (!db) {
    return;
  }
  db.close();
  connectionPool.delete(databasePath);
}
