import axios from "axios";

export interface BrandDensityResponse {
  city: string;
  keywords: string[];
  keywordSetHash: string;
  gridSizeMeters: number;
  generatedAt: number;
  source: "cache" | "network" | "mixed";
  heatmap: Array<{
    gridId: string;
    count: number;
    center: { lng: number; lat: number };
  }>;
  totalPois: number;
  mainBrand: {
    keyword: string;
    label: string;
  };
  competitorKeywords: string[];
  allPois: PoiPointSummary[];
  mainBrandPois: PoiPointSummary[];
  competitorPois: PoiPointSummary[];
}

export interface PoiPointSummary {
  keyword: string;
  poiId: string;
  name: string;
  category: string;
  longitude: number;
  latitude: number;
  city: string;
  fetchedAt: number;
}

export interface TargetAnalysisResponse {
  city: string;
  target: { lng: number; lat: number };
  mainBrand: string;
  mainBrandLabel: string;
  competitorKeywords: string[];
  radiusMeters: number;
  generatedAt: number;
  source: "cache" | "network" | "mixed";
  densityLevel: "high" | "medium" | "low";
  counts: {
    mainBrand500m: number;
    mainBrand1000m: number;
    competitor100m: number;
    competitor300m: number;
    competitor1000m: number;
  };
  samplePois: {
    mainBrand: PoiSummary[];
    competitors: PoiSummary[];
  };
}

export interface CacheKeywordStat {
  keyword: string;
  city: string;
  count: number;
  lastFetchedAt: number;
}

export interface CacheStatsResponse {
  city: string | null;
  stats: CacheKeywordStat[];
  total: number;
  generatedAt: number;
}

export interface CacheRefreshResponse {
  city: string;
  keywords: string[];
  totalFetched: number;
  generatedAt: number;
  results: Array<{ keyword: string; fetched: number }>;
}

export interface PoiSummary {
  keyword: string;
  city: string;
  poiId: string;
  name: string;
  category: string;
  address: string;
  longitude: number;
  latitude: number;
  fetchedAt: number;
  fetchSource?: string;
}

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL?.trim()) || "/api";

const client = axios.create({
  baseURL: API_BASE_URL.replace(/\/+$/, ""),
  timeout: 120000, // 增加到2分钟，给数据采集更长时间
});

export interface DensityPayload {
  city: string;
  keywords: string[];
  mainBrand?: string;
}

export interface AnalysisPayload {
  city: string;
  mainBrand: string;
  competitorKeywords: string[];
  radiusMeters: number;
  target: { lng: number; lat: number };
}

export async function fetchBrandDensity(payload: DensityPayload): Promise<BrandDensityResponse> {
  const { data } = await client.post<BrandDensityResponse>("/poi/density", payload);
  return data;
}

export async function fetchTargetAnalysis(payload: AnalysisPayload): Promise<TargetAnalysisResponse> {
  const { data } = await client.post<TargetAnalysisResponse>("/poi/analysis", payload);
  return data;
}

export async function fetchCacheStats(city?: string): Promise<CacheStatsResponse> {
  const { data } = await client.get<CacheStatsResponse>("/poi/cache/stats", {
    params: city ? { city } : undefined,
  });
  return data;
}

export interface CacheRefreshPayload {
  city: string;
  keywords: string[];
}

export async function refreshCache(payload: CacheRefreshPayload): Promise<CacheRefreshResponse> {
  const { data } = await client.post<CacheRefreshResponse>("/poi/cache/refresh", payload);
  return data;
}

export interface PlanningPoint {
  id: string;
  city: string;
  name: string;
  longitude: number;
  latitude: number;
  radiusMeters: number;
  color: string;
  colorToken: string;
  status: "pending" | "priority" | "dropped";
  priorityRank: number;
  notes: string;
  sourceType: "poi" | "manual";
  sourcePoiId: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PlanningPointPayload {
  city: string;
  name: string;
  radiusMeters?: number;
  color?: string;
  colorToken?: string;
  status?: PlanningPoint["status"];
  priorityRank?: number;
  notes?: string;
  sourceType?: PlanningPoint["sourceType"];
  sourcePoiId?: string | null;
  updatedBy?: string | null;
  center: { lng: number; lat: number };
}

export interface PlanningPointUpdatePayload {
  city?: string;
  name?: string;
  radiusMeters?: number;
  color?: string;
  colorToken?: string;
  status?: PlanningPoint["status"];
  priorityRank?: number;
  notes?: string;
  sourceType?: PlanningPoint["sourceType"];
  sourcePoiId?: string | null;
  updatedBy?: string | null;
  center?: { lng: number; lat: number };
}

export interface PlanningPoiSuggestion {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  city: string;
}

export interface PlanningPoiSearchPayload {
  city: string;
  keyword: string;
  limit?: number;
}

export async function fetchPlanningPoints(city?: string): Promise<PlanningPoint[]> {
  const { data } = await client.get<PlanningPoint[]>("/planning/points", {
    params: city ? { city } : undefined,
  });
  return data;
}

export async function createPlanningPoint(payload: PlanningPointPayload): Promise<PlanningPoint> {
  const { data } = await client.post<PlanningPoint>("/planning/points", payload);
  return data;
}

export async function updatePlanningPoint(
  id: string,
  payload: PlanningPointUpdatePayload
): Promise<PlanningPoint> {
  const { data } = await client.put<PlanningPoint>(`/planning/points/${id}`, payload);
  return data;
}

export async function deletePlanningPoint(id: string): Promise<void> {
  await client.delete(`/planning/points/${id}`);
}

export async function searchPlanningPois(
  payload: PlanningPoiSearchPayload
): Promise<PlanningPoiSuggestion[]> {
  const { data } = await client.post<PlanningPoiSuggestion[]>("/planning/search", payload);
  return data;
}
