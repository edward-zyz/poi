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
const DEFAULT_COLOR_TOKEN = "pending";
const MIN_RADIUS_METERS = 100;
const MAX_RADIUS_METERS = 2000;
const MIN_PRIORITY_RANK = 1;
const MAX_PRIORITY_RANK = 999;
const DEFAULT_PRIORITY_RANK = 100;
const NOTES_MAX_LENGTH = 2000;

const STATUS_COLOR_MAP: Record<string, string> = {
  pending: "#22c55e", // 待考察
  priority: "#2563eb", // 重点跟进
  dropped: "#94a3b8", // 淘汰
};

const VALID_STATUS_SET = new Set(Object.keys(STATUS_COLOR_MAP));
const VALID_SOURCE_TYPES = new Set(["poi", "manual"]);

export interface CreatePlanningPointPayload {
  city: string;
  name: string;
  longitude: number;
  latitude: number;
  radiusMeters?: number;
  color?: string;
  colorToken?: string;
  status?: string;
  priorityRank?: number;
  notes?: string;
  sourceType?: string;
  sourcePoiId?: string | null;
  updatedBy?: string | null;
}

export interface UpdatePlanningPointPayload {
  city?: string;
  name?: string;
  longitude?: number;
  latitude?: number;
  radiusMeters?: number;
  color?: string;
  colorToken?: string;
  status?: string;
  priorityRank?: number;
  notes?: string;
  sourceType?: string;
  sourcePoiId?: string | null;
  updatedBy?: string | null;
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
    const updates = this.normalizeUpdatePayload(payload, existing);
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
    const status = normalizeStatus(payload.status);
    const colorToken = normalizeColorToken(payload.colorToken ?? status);
    const color = resolveColor(colorToken, payload.color);
    const priorityRank = clampPriorityRank(payload.priorityRank);
    const notes = sanitizeNotes(payload.notes);
    const sourceType = normalizeSourceType(payload.sourceType);
    const sourcePoiId = sanitizeSourcePoiId(payload.sourcePoiId, sourceType);
    const updatedBy = sanitizeUpdatedBy(payload.updatedBy);

    return {
      id: randomUUID(),
      city,
      name: shorten(name, 120),
      longitude: sanitizeCoordinate(payload.longitude),
      latitude: sanitizeCoordinate(payload.latitude),
      radiusMeters,
      color,
      colorToken,
      status,
      priorityRank,
      notes,
      sourceType,
      sourcePoiId,
      updatedBy,
    };
  }

  private normalizeUpdatePayload(
    payload: UpdatePlanningPointPayload,
    existing: PlanningPointRecord
  ): PlanningPointUpdateInput {
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

    const hasStatusChange = payload.status !== undefined;
    const hasColorTokenChange = payload.colorToken !== undefined;
    const hasColorChange = payload.color !== undefined;
    if (hasStatusChange || hasColorTokenChange || hasColorChange) {
      const nextStatus = hasStatusChange ? normalizeStatus(payload.status) : existing.status;
      const nextColorToken = normalizeColorToken(
        hasColorTokenChange ? payload.colorToken : nextStatus ?? existing.colorToken
      );
      const shouldKeepExistingColor = !hasStatusChange && !hasColorTokenChange && !hasColorChange;
      const explicitColor = hasColorChange ? payload.color : undefined;
      const nextColor = resolveColor(
        nextColorToken,
        shouldKeepExistingColor ? existing.color : explicitColor
      );
      updates.status = nextStatus;
      updates.colorToken = nextColorToken;
      updates.color = nextColor;
    }

    if (payload.priorityRank !== undefined) {
      updates.priorityRank = clampPriorityRank(payload.priorityRank);
    }

    if (payload.notes !== undefined) {
      updates.notes = sanitizeNotes(payload.notes);
    }

    if (payload.sourceType !== undefined) {
      const sourceType = normalizeSourceType(payload.sourceType);
      updates.sourceType = sourceType;
      if (payload.sourcePoiId !== undefined || sourceType !== existing.sourceType) {
        updates.sourcePoiId = sanitizeSourcePoiId(payload.sourcePoiId, sourceType);
      }
    } else if (payload.sourcePoiId !== undefined) {
      updates.sourcePoiId = sanitizeSourcePoiId(payload.sourcePoiId, existing.sourceType);
    }

    if (payload.updatedBy !== undefined) {
      updates.updatedBy = sanitizeUpdatedBy(payload.updatedBy);
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

function normalizeColorToken(colorToken: string | undefined): string {
  if (!colorToken) {
    return DEFAULT_COLOR_TOKEN;
  }
  const normalized = colorToken.trim().toLowerCase();
  if (normalized.length === 0) {
    return DEFAULT_COLOR_TOKEN;
  }
  if (!STATUS_COLOR_MAP[normalized]) {
    return DEFAULT_COLOR_TOKEN;
  }
  return normalized;
}

function resolveColor(colorToken: string, customColor?: string): string {
  if (customColor) {
    return normalizeColor(customColor);
  }
  return STATUS_COLOR_MAP[colorToken] ?? DEFAULT_COLOR;
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

function normalizeStatus(status: string | undefined): string {
  if (!status) {
    return "pending";
  }
  const normalized = status.trim().toLowerCase();
  if (!VALID_STATUS_SET.has(normalized)) {
    return "pending";
  }
  return normalized;
}

function clampPriorityRank(value: number | undefined): number {
  const numeric = Number(value ?? DEFAULT_PRIORITY_RANK);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PRIORITY_RANK;
  }
  return Math.min(Math.max(Math.round(numeric), MIN_PRIORITY_RANK), MAX_PRIORITY_RANK);
}

function sanitizeNotes(value: string | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.length > NOTES_MAX_LENGTH) {
    return trimmed.slice(0, NOTES_MAX_LENGTH);
  }
  return trimmed;
}

function normalizeSourceType(sourceType: string | undefined): string {
  if (!sourceType) {
    return "manual";
  }
  const normalized = sourceType.trim().toLowerCase();
  if (VALID_SOURCE_TYPES.has(normalized)) {
    return normalized;
  }
  return "manual";
}

function sanitizeSourcePoiId(
  sourcePoiId: string | null | undefined,
  sourceType: string
): string | null {
  if (sourceType !== "poi") {
    return null;
  }
  if (!sourcePoiId) {
    return null;
  }
  const trimmed = sourcePoiId.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return shorten(trimmed, 120);
}

function sanitizeUpdatedBy(updatedBy: string | null | undefined): string | null {
  if (!updatedBy) {
    return null;
  }
  const trimmed = updatedBy.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return shorten(trimmed, 120);
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
