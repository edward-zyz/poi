import type Database from "better-sqlite3";

import { getConnection } from "./db.js";

export interface PlanningPointRecord {
  id: string;
  city: string;
  name: string;
  longitude: number;
  latitude: number;
  radiusMeters: number;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export type PlanningPointCreateInput = Omit<PlanningPointRecord, "createdAt" | "updatedAt"> & {
  createdAt?: number;
  updatedAt?: number;
};

export type PlanningPointUpdateInput = Partial<
  Pick<PlanningPointRecord, "city" | "name" | "longitude" | "latitude" | "radiusMeters" | "color">
>;

const COLUMN_MAP: Record<keyof PlanningPointUpdateInput, string> = {
  city: "city",
  name: "name",
  longitude: "longitude",
  latitude: "latitude",
  radiusMeters: "radius_meters",
  color: "color",
};

export class PlanningPointRepository {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = getConnection(databasePath);
  }

  list(city?: string): PlanningPointRecord[] {
    const clauses: string[] = [];
    const params: any[] = [];
    if (city && city.trim().length > 0) {
      clauses.push("city = ?");
      params.push(city.trim());
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `
        SELECT id, city, name, longitude, latitude, radius_meters as radiusMeters,
               color, created_at as createdAt, updated_at as updatedAt
        FROM planning_points
        ${where}
        ORDER BY created_at DESC
      `
      )
      .all(...params) as PlanningPointRecord[];

    return rows.map(PlanningPointRepository.normalizeRow);
  }

  getById(id: string): PlanningPointRecord | undefined {
    const row = this.db
      .prepare(
        `
        SELECT id, city, name, longitude, latitude, radius_meters as radiusMeters,
               color, created_at as createdAt, updated_at as updatedAt
        FROM planning_points
        WHERE id = ?
      `
      )
      .get(id) as PlanningPointRecord | undefined;
    return row ? PlanningPointRepository.normalizeRow(row) : undefined;
  }

  create(input: PlanningPointCreateInput): PlanningPointRecord {
    const timestamp = Math.floor(Date.now() / 1000);
    const createdAt = Number.isFinite(input.createdAt) ? Number(input.createdAt) : timestamp;
    const updatedAt = Number.isFinite(input.updatedAt) ? Number(input.updatedAt) : timestamp;

    const stmt = this.db.prepare(`
      INSERT INTO planning_points (id, city, name, longitude, latitude, radius_meters, color, created_at, updated_at)
      VALUES (@id, @city, @name, @longitude, @latitude, @radiusMeters, @color, @createdAt, @updatedAt)
    `);

    stmt.run({
      id: input.id,
      city: input.city,
      name: input.name,
      longitude: input.longitude,
      latitude: input.latitude,
      radiusMeters: input.radiusMeters,
      color: input.color,
      createdAt,
      updatedAt,
    });

    return {
      id: input.id,
      city: input.city,
      name: input.name,
      longitude: input.longitude,
      latitude: input.latitude,
      radiusMeters: input.radiusMeters,
      color: input.color,
      createdAt,
      updatedAt,
    };
  }

  update(id: string, updates: PlanningPointUpdateInput): PlanningPointRecord | undefined {
    const entries = Object.entries(updates).filter(
      (entry): entry is [keyof PlanningPointUpdateInput, any] =>
        entry[1] !== undefined && entry[0] in COLUMN_MAP
    );

    if (entries.length === 0) {
      return this.getById(id);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const assignments: string[] = entries.map(([key]) => `${COLUMN_MAP[key]} = @${key}`);
    assignments.push("updated_at = @updatedAt");

    const stmt = this.db.prepare(`
      UPDATE planning_points
      SET ${assignments.join(", ")}
      WHERE id = @id
    `);

    const params = entries.reduce<Record<string, any>>(
      (acc, [key, value]) => {
        acc[key] = value;
        return acc;
      },
      { id, updatedAt: timestamp }
    );

    stmt.run(params);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(
        `
        DELETE FROM planning_points
        WHERE id = ?
      `
      )
      .run(id);
    return result.changes > 0;
  }

  private static normalizeRow(row: PlanningPointRecord): PlanningPointRecord {
    return {
      id: String(row.id),
      city: String(row.city ?? ""),
      name: String(row.name ?? ""),
      longitude: Number(row.longitude ?? 0),
      latitude: Number(row.latitude ?? 0),
      radiusMeters: Number(row.radiusMeters ?? 0),
      color: String(row.color ?? "#22c55e"),
      createdAt: Number(row.createdAt ?? 0),
      updatedAt: Number(row.updatedAt ?? 0),
    };
  }
}
