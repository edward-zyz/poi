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

const client = axios.create({
  baseURL: "/api",
  timeout: 10000,
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
