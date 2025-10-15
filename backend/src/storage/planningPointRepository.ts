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
  colorToken: string;
  status: string;
  priorityRank: number;
  notes: string;
  sourceType: string;
  sourcePoiId: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export type PlanningPointCreateInput = Omit<
  PlanningPointRecord,
  "createdAt" | "updatedAt" | "updatedBy"
> & {
  createdAt?: number;
  updatedAt?: number;
  updatedBy?: string | null;
};

export type PlanningPointUpdateInput = Partial<
  Pick<
    PlanningPointRecord,
    | "city"
    | "name"
    | "longitude"
    | "latitude"
    | "radiusMeters"
    | "color"
    | "colorToken"
    | "status"
    | "priorityRank"
    | "notes"
    | "sourceType"
    | "sourcePoiId"
    | "updatedBy"
  >
>;

const COLUMN_MAP: Record<keyof PlanningPointUpdateInput, string> = {
  city: "city",
  name: "name",
  longitude: "longitude",
  latitude: "latitude",
  radiusMeters: "radius_meters",
  color: "color",
  colorToken: "color_token",
  status: "status",
  priorityRank: "priority_rank",
  notes: "notes",
  sourceType: "source_type",
  sourcePoiId: "source_poi_id",
  updatedBy: "updated_by",
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
               color, color_token as colorToken, status, priority_rank as priorityRank,
               COALESCE(notes, '') as notes, source_type as sourceType,
               source_poi_id as sourcePoiId, updated_by as updatedBy,
               created_at as createdAt, updated_at as updatedAt
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
               color, color_token as colorToken, status, priority_rank as priorityRank,
               COALESCE(notes, '') as notes, source_type as sourceType,
               source_poi_id as sourcePoiId, updated_by as updatedBy,
               created_at as createdAt, updated_at as updatedAt
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
      INSERT INTO planning_points (
        id,
        city,
        name,
        longitude,
        latitude,
        radius_meters,
        color,
        color_token,
        status,
        priority_rank,
        notes,
        source_type,
        source_poi_id,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @city,
        @name,
        @longitude,
        @latitude,
        @radiusMeters,
        @color,
        @colorToken,
        @status,
        @priorityRank,
        @notes,
        @sourceType,
        @sourcePoiId,
        @updatedBy,
        @createdAt,
        @updatedAt
      )
    `);

    stmt.run({
      id: input.id,
      city: input.city,
      name: input.name,
      longitude: input.longitude,
      latitude: input.latitude,
      radiusMeters: input.radiusMeters,
      color: input.color,
      colorToken: input.colorToken,
      status: input.status,
      priorityRank: input.priorityRank,
      notes: input.notes,
      sourceType: input.sourceType,
      sourcePoiId: input.sourcePoiId ?? null,
      updatedBy: input.updatedBy ?? null,
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
      colorToken: input.colorToken,
      status: input.status,
      priorityRank: input.priorityRank,
      notes: input.notes,
      sourceType: input.sourceType,
      sourcePoiId: input.sourcePoiId ?? null,
      updatedBy: input.updatedBy ?? null,
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
      colorToken: String(row.colorToken ?? "pending"),
      status: String(row.status ?? "pending"),
      priorityRank: Number(row.priorityRank ?? 100),
      notes: String(row.notes ?? ""),
      sourceType: String(row.sourceType ?? "manual"),
      sourcePoiId: row.sourcePoiId ? String(row.sourcePoiId) : null,
      updatedBy: row.updatedBy ? String(row.updatedBy) : null,
      createdAt: Number(row.createdAt ?? 0),
      updatedAt: Number(row.updatedAt ?? 0),
    };
  }
}
