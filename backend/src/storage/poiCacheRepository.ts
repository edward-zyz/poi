import type Database from "better-sqlite3";

import { getConnection } from "./db.js";

export interface PoiRecord {
  keyword: string;
  city: string;
  poiId: string;
  name: string;
  category: string;
  address: string;
  longitude: number;
  latitude: number;
  rawJson: unknown;
  fetchedAt: number;
  fetchSource?: string;
}

export interface AggregateRecord {
  city: string;
  keywordSetHash: string;
  gridId: string;
  poiCount: number;
  radius: number;
  payload: unknown;
  computedAt: number;
}

export interface AnalysisCacheRecord {
  city: string;
  keywordSetHash: string;
  resultJson: unknown;
  computedAt: number;
}

export interface PoiKeywordStat {
  keyword: string;
  city: string;
  count: number;
  lastFetchedAt: number;
}

export interface PoiSummaryRow {
  keyword: string;
  city: string;
  poiId: string;
  name: string;
  category: string;
  address: string;
  longitude: number;
  latitude: number;
  fetchSource?: string;
  fetchedAt: number;
}

export class PoiCacheRepository {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = getConnection(databasePath);
  }

  private static normalizePoiRow(row: PoiRecord) {
    return {
      keyword: String(row.keyword ?? "").toLowerCase(),
      city: String(row.city ?? ""),
      poiId: String(row.poiId ?? ""),
      name: row.name ? String(row.name) : "",
      category: row.category ? String(row.category) : "",
      address: row.address ? String(row.address) : "",
      longitude: Number.isFinite(row.longitude) ? row.longitude : 0,
      latitude: Number.isFinite(row.latitude) ? row.latitude : 0,
      rawJson: JSON.stringify(row.rawJson ?? {}),
      fetchSource: row.fetchSource ? String(row.fetchSource) : "gaode",
      fetchedAt: Number.isFinite(row.fetchedAt) ? row.fetchedAt : Math.floor(Date.now() / 1000),
    };
  }

  upsertPois(records: PoiRecord[]): void {
    if (records.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO poi_cache
      (keyword, city, poi_id, name, category, address, longitude, latitude, raw_json, fetch_source, fetched_at)
      VALUES (@keyword, @city, @poiId, @name, @category, @address, @longitude, @latitude, @rawJson, @fetchSource, @fetchedAt)
    `);

    const tx = this.db.transaction((rows: PoiRecord[]) => {
      for (const row of rows) {
        const sanitized = PoiCacheRepository.normalizePoiRow(row);
        stmt.run(sanitized);
      }
    });

    tx(records);
  }

  getKeywordStats(city?: string): PoiKeywordStat[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (city && city.trim().length > 0) {
      conditions.push("city = ?");
      params.push(city.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = this.db
      .prepare(
        `
        SELECT keyword, city, COUNT(*) as count, MAX(fetched_at) as lastFetchedAt
        FROM poi_cache
        ${whereClause}
        GROUP BY keyword, city
        ORDER BY count DESC
      `
      )
      .all(...params) as PoiKeywordStat[];

    return rows.map((row) => ({
      keyword: row.keyword,
      city: row.city,
      count: Number(row.count ?? 0),
      lastFetchedAt: Number(row.lastFetchedAt ?? 0),
    }));
  }

  getAllPois(city?: string, maxAgeSeconds?: number): PoiRecord[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (city && city.trim().length > 0) {
      conditions.push("city = ?");
      params.push(city.trim());
    }

    if (typeof maxAgeSeconds === "number") {
      conditions.push("fetched_at >= ?");
      params.push(Math.floor(Date.now() / 1000) - maxAgeSeconds);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = this.db
      .prepare(
        `
        SELECT keyword, city, poi_id as poiId, name, category, address, longitude, latitude, raw_json as rawJson, fetch_source as fetchSource, fetched_at as fetchedAt
        FROM poi_cache
        ${whereClause}
      `
      )
      .all(...params) as PoiRecord[];

    return rows.map((row) => ({
      ...row,
      rawJson: typeof row.rawJson === "string" ? JSON.parse(row.rawJson) : row.rawJson,
    }));
  }

  getPois(city: string, keywords: string[], maxAgeSeconds?: number): PoiRecord[] {
    if (keywords.length === 0) return [];

    const placeholders = keywords.map(() => "?").join(",");
    const conditions: string[] = ["city = ?", `keyword IN (${placeholders})`];
    const params: Array<string | number> = [city, ...keywords];
    if (typeof maxAgeSeconds === "number") {
      conditions.push("fetched_at >= ?");
      const minTimestamp = Math.floor(Date.now() / 1000) - maxAgeSeconds;
      params.push(minTimestamp);
    }

    const rows = this.db
      .prepare(
        `
      SELECT keyword, city, poi_id as poiId, name, category, address, longitude, latitude, raw_json as rawJson, fetch_source as fetchSource, fetched_at as fetchedAt
      FROM poi_cache
      WHERE ${conditions.join(" AND ")}
    `
      )
      .all(...params) as PoiRecord[];

    return rows.map((row) => ({
      ...row,
      rawJson: typeof row.rawJson === "string" ? JSON.parse(row.rawJson) : row.rawJson,
    }));
  }

  storeAggregate(records: AggregateRecord[]): void {
    if (records.length === 0) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO poi_aggregate
      (city, keyword_set_hash, grid_id, poi_count, radius, payload, computed_at)
      VALUES (@city, @keywordSetHash, @gridId, @poiCount, @radius, @payload, @computedAt)
    `);

    const tx = this.db.transaction((rows: AggregateRecord[]) => {
      for (const row of rows) {
        stmt.run({
          ...row,
          payload: JSON.stringify(row.payload ?? {}),
        });
      }
    });

    tx(records);
  }

  loadAggregate(
    city: string,
    keywordSetHash: string,
    maxAgeSeconds?: number
  ): AggregateRecord[] {
    const conditions = ["city = ?", "keyword_set_hash = ?"];
    const params: Array<string | number> = [city, keywordSetHash];
    if (typeof maxAgeSeconds === "number") {
      conditions.push("computed_at >= ?");
      params.push(Math.floor(Date.now() / 1000) - maxAgeSeconds);
    }

    const rows = this.db
      .prepare(
        `
      SELECT city, keyword_set_hash as keywordSetHash, grid_id as gridId, poi_count as poiCount, radius, payload, computed_at as computedAt
      FROM poi_aggregate
      WHERE ${conditions.join(" AND ")}
    `
      )
      .all(...params) as AggregateRecord[];

    return rows.map((row) => ({
      ...row,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    }));
  }

  storeAnalysis(record: AnalysisCacheRecord): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO poi_analysis_cache (city, keyword_set_hash, result_json, computed_at)
      VALUES (@city, @keywordSetHash, @resultJson, @computedAt)
    `
      )
      .run({
        ...record,
        resultJson: JSON.stringify(record.resultJson),
      });
  }

  loadAnalysis(
    city: string,
    keywordSetHash: string,
    maxAgeSeconds?: number
  ): AnalysisCacheRecord | undefined {
    const conditions = ["city = ?", "keyword_set_hash = ?"];
    const params: Array<string | number> = [city, keywordSetHash];
    if (typeof maxAgeSeconds === "number") {
      conditions.push("computed_at >= ?");
      params.push(Math.floor(Date.now() / 1000) - maxAgeSeconds);
    }

    const row = this.db
      .prepare(
        `
      SELECT city, keyword_set_hash as keywordSetHash, result_json as resultJson, computed_at as computedAt
      FROM poi_analysis_cache
      WHERE ${conditions.join(" AND ")}
    `
      )
      .get(...params) as AnalysisCacheRecord | undefined;
    if (!row) return undefined;
    return {
      ...row,
      resultJson: JSON.parse(row.resultJson as unknown as string),
    };
  }
}
