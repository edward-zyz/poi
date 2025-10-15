import { randomUUID } from "node:crypto";

import type { AppConfig } from "../settings/config.js";
import { GaodeProvider, type GaodePoi } from "../providers/gaodeProvider.js";
import {
  PlanningPointRepository,
  type PlanningPointRecord,
  type PlanningPointCreateInput,
  type PlanningPointUpdateInput,
} from "../storage/planningPointRepository.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../settings/logger.js";

const DEFAULT_RADIUS_METERS = 1000;
const DEFAULT_COLOR = "#22c55e";
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 5000;

export interface CreatePlanningPointPayload {
  city: string;
  name: string;
  longitude: number;
  latitude: number;
  radiusMeters?: number;
  color?: string;
}

export interface UpdatePlanningPointPayload {
  city?: string;
  name?: string;
  longitude?: number;
  latitude?: number;
  radiusMeters?: number;
  color?: string;
}

export interface PlanningPoiSuggestion {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  city: string;
}

interface PlanningServiceOptions {
  provider?: GaodeProvider;
}

export class PlanningService {
  private readonly repo: PlanningPointRepository;
  private readonly provider: GaodeProvider;

  constructor(config: AppConfig, options: PlanningServiceOptions = {}) {
    this.repo = new PlanningPointRepository(config.databasePath);
    this.provider = options.provider ?? new GaodeProvider({ config: config.gaode });
  }

  list(city?: string): PlanningPointRecord[] {
    return this.repo.list(city);
  }

  get(id: string): PlanningPointRecord | undefined {
    return this.repo.getById(id);
  }

  create(payload: CreatePlanningPointPayload): PlanningPointRecord {
    const record = this.normalizeCreatePayload(payload);
    return this.repo.create(record);
  }

  update(id: string, payload: UpdatePlanningPointPayload): PlanningPointRecord {
    const existing = this.repo.getById(id);
    if (!existing) {
      throw new AppError("规划点不存在", { status: 404, code: "planning_point_not_found" });
    }
    const updates = this.normalizeUpdatePayload(payload);
    if (Object.keys(updates).length === 0) {
      return existing;
    }
    const updated = this.repo.update(id, updates);
    if (!updated) {
      throw new AppError("规划点更新失败", { status: 500, code: "planning_point_update_failed" });
    }
    return updated;
  }

  delete(id: string): void {
    const deleted = this.repo.delete(id);
    if (!deleted) {
      throw new AppError("规划点不存在", { status: 404, code: "planning_point_not_found" });
    }
  }

  async searchPois(city: string, keyword: string, limit = 8): Promise<PlanningPoiSuggestion[]> {
    const trimmedCity = city.trim();
    const trimmedKeyword = keyword.trim();

    if (!trimmedCity) {
      throw new AppError("城市不能为空", { status: 400, code: "invalid_city" });
    }
    if (!trimmedKeyword) {
      throw new AppError("请输入搜索关键词", { status: 400, code: "invalid_keyword" });
    }

    try {
      const pois = await this.provider.placeTextSearch({
        city: trimmedCity,
        keywords: trimmedKeyword,
        offset: Math.min(Math.max(limit, 1), 25),
      });
      return pois.slice(0, limit).map(mapPoiToSuggestion(trimmedCity));
    } catch (error) {
      logger.error({ err: error }, "Planning POI search failed");
      throw new AppError("POI 搜索失败，请稍后重试", {
        status: 502,
        code: "poi_search_failed",
      });
    }
  }

  private normalizeCreatePayload(payload: CreatePlanningPointPayload): PlanningPointCreateInput {
    const city = payload.city.trim();
    const name = payload.name.trim();
    if (!city) {
      throw new AppError("城市不能为空", { status: 400, code: "invalid_city" });
    }
    if (!name) {
      throw new AppError("名称不能为空", { status: 400, code: "invalid_name" });
    }

    const radiusMeters = clampRadius(payload.radiusMeters);
    const color = normalizeColor(payload.color);

    return {
      id: randomUUID(),
      city,
      name: shorten(name, 120),
      longitude: sanitizeCoordinate(payload.longitude),
      latitude: sanitizeCoordinate(payload.latitude),
      radiusMeters,
      color,
    };
  }

  private normalizeUpdatePayload(payload: UpdatePlanningPointPayload): PlanningPointUpdateInput {
    const updates: PlanningPointUpdateInput = {};
    if (payload.city !== undefined) {
      const city = payload.city.trim();
      if (!city) {
        throw new AppError("城市不能为空", { status: 400, code: "invalid_city" });
      }
      updates.city = city;
    }

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      if (!name) {
        throw new AppError("名称不能为空", { status: 400, code: "invalid_name" });
      }
      updates.name = shorten(name, 120);
    }

    if (payload.longitude !== undefined) {
      updates.longitude = sanitizeCoordinate(payload.longitude);
    }
    if (payload.latitude !== undefined) {
      updates.latitude = sanitizeCoordinate(payload.latitude);
    }

    if (payload.radiusMeters !== undefined) {
      updates.radiusMeters = clampRadius(payload.radiusMeters);
    }

    if (payload.color !== undefined) {
      updates.color = normalizeColor(payload.color);
    }

    return updates;
  }
}

function clampRadius(value: number | undefined): number {
  const numeric = Number(value ?? DEFAULT_RADIUS_METERS);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_RADIUS_METERS;
  }
  return Math.min(Math.max(Math.round(numeric), MIN_RADIUS_METERS), MAX_RADIUS_METERS);
}

function sanitizeCoordinate(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new AppError("坐标格式不正确", { status: 400, code: "invalid_coordinate" });
  }
  return numeric;
}

function normalizeColor(color: string | undefined): string {
  const fallback = DEFAULT_COLOR;
  if (!color) return fallback;
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

function mapPoiToSuggestion(defaultCity: string) {
  return (poi: GaodePoi): PlanningPoiSuggestion => ({
    id: poi.id,
    name: poi.name ?? "未命名地点",
    address: poi.address ?? "",
    longitude: poi.location.lng,
    latitude: poi.location.lat,
    city: poi.city || defaultCity,
  });
}
