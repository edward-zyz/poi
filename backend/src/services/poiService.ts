import { createHash } from "node:crypto";

import type { AppConfig } from "../settings/config.js";
import { logger } from "../settings/logger.js";
import type { GaodePoi } from "../providers/gaodeProvider.js";
import { GaodeProvider } from "../providers/gaodeProvider.js";
import {
  PoiCacheRepository,
  type PoiKeywordStat,
  type PoiRecord,
} from "../storage/poiCacheRepository.js";
import { aggregateToGrid, gridIdForPoint, haversineDistanceMeters } from "../utils/geo.js";
import { AppError } from "../utils/errors.js";

type FetchSource = "cache" | "network" | "mixed";

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

export interface BrandDensityResult {
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

export interface TargetAnalysisParams {
  city: string;
  target: { lng: number; lat: number };
  mainBrand: string;
  competitorKeywords: string[];
  radiusMeters: number;
}

export interface TargetAnalysisResult {
  city: string;
  target: { lng: number; lat: number };
  mainBrand: string;
  mainBrandLabel: string;
  competitorKeywords: string[];
  radiusMeters: number;
  generatedAt: number;
  counts: {
    mainBrand500m: number;
    mainBrand1000m: number;
    competitor100m: number;
    competitor300m: number;
    competitor1000m: number;
  };
  densityLevel: "high" | "medium" | "low";
  source: "cache" | "network" | "mixed";
  samplePois: {
    mainBrand: PoiRecord[];
    competitors: PoiRecord[];
  };
}

export interface PoiCacheStatsResult {
  city: string | null;
  stats: PoiKeywordStat[];
  total: number;
  generatedAt: number;
}

export interface PoiCacheRefreshResult {
  city: string;
  keywords: string[];
  totalFetched: number;
  generatedAt: number;
  results: Array<{ keyword: string; fetched: number }>;
}

export interface PoiProvider {
  placeTextSearch(params: { keywords: string; city: string }): Promise<GaodePoi[]>;
  placeAround?(params: {
    location: { lng: number; lat: number };
    radius: number;
    keywords?: string;
  }): Promise<GaodePoi[]>;
}

interface PoiServiceOptions {
  provider?: PoiProvider;
}

interface LoadDensityParams {
  city: string;
  keywords: string[];
  mainBrand?: string;
}

export class PoiService {
  private readonly config: AppConfig;
  private readonly repo: PoiCacheRepository;
  private readonly provider: PoiProvider;

  constructor(config: AppConfig, options: PoiServiceOptions = {}) {
    this.config = config;
    this.repo = new PoiCacheRepository(config.databasePath);
    this.provider = options.provider ?? new GaodeProvider({ config: config.gaode });
  }

  async loadBrandDensity(params: LoadDensityParams): Promise<BrandDensityResult> {
    const normalizedKeywords = normalizeKeywords(params.keywords);
    if (normalizedKeywords.length === 0) {
      throw new Error("At least one keyword is required");
    }

    const mainBrandLabel = params.mainBrand?.trim() ?? normalizedKeywords[0] ?? "";
    const mainBrand = mainBrandLabel.toLowerCase();
    const competitorKeywords = normalizedKeywords.filter((keyword) => keyword !== mainBrand);

    const keywordSetHash = hashKey([params.city, ...normalizedKeywords].join("|"));

    const cachedAggregate = this.repo.loadAnalysis(
      params.city,
      keywordSetHash,
      this.config.cacheTtlSeconds
    );

    if (cachedAggregate) {
      return {
        ...(cachedAggregate.resultJson as BrandDensityResult),
        source: "cache",
      };
    }

    const { poisByKeyword, source } = await this.ensurePois(params.city, normalizedKeywords, {
      allowNetworkFetch: false,
    });
    const gridSize = 500;

    // For heatmap generation, ignore TTL limit to show available data
    const allCached = dedupePois(
      this.repo.getAllPois(params.city)
    );

    const heatmap = aggregateToGrid(
      allCached.map((poi) => ({
        lng: poi.longitude,
        lat: poi.latitude,
      })),
      gridSize
    ).map((cell) => ({
      gridId: cell.gridId,
      count: cell.count,
      center: cell.center,
    }));

    const mainBrandPois = dedupePois(poisByKeyword[mainBrand] ?? []);
    const competitorByKeyword = competitorKeywords.map((keyword) => ({
      keyword,
      pois: dedupePois(poisByKeyword[keyword] ?? []),
    }));
    const competitorPois = dedupePois(competitorByKeyword.flatMap((item) => item.pois));

    const result: BrandDensityResult = {
      city: params.city,
      keywords: normalizedKeywords,
      keywordSetHash,
      gridSizeMeters: gridSize,
      generatedAt: Math.floor(Date.now() / 1000),
      source,
      heatmap,
      totalPois: allCached.length,
      mainBrand: {
        keyword: mainBrand,
        label: mainBrandLabel,
      },
      competitorKeywords,
      allPois: allCached.map(poiRecordToSummary),
      mainBrandPois: mainBrandPois.map(poiRecordToSummary),
      competitorPois: competitorPois.map(poiRecordToSummary),
    };

    logger.info(
      {
        city: params.city,
        keywords: normalizedKeywords,
        totalPois: result.totalPois,
        source,
        heatmapCells: result.heatmap.length,
      },
      "Brand density computed"
    );

    this.repo.storeAnalysis({
      city: params.city,
      keywordSetHash,
      resultJson: { ...result, source: "cache" },
      computedAt: result.generatedAt,
    });

    return result;
  }

  async analyzeTargetPoint(params: TargetAnalysisParams): Promise<TargetAnalysisResult> {
    const mainBrandLabel = params.mainBrand.trim();
    const mainBrand = mainBrandLabel.toLowerCase();
    const competitorKeywords = normalizeKeywords(params.competitorKeywords);
    const keywords = [mainBrand, ...competitorKeywords];
    const { poisByKeyword, source } = await this.ensurePois(params.city, keywords, {
      allowNetworkFetch: false,
    });

    const mainPois = dedupePois(poisByKeyword[mainBrand] ?? []);
    const competitorPois = dedupePois(
      competitorKeywords.flatMap((keyword) => poisByKeyword[keyword] ?? [])
    );

    const target = params.target;

    const counts = {
      mainBrand500m: countWithin(mainPois, target, 500),
      mainBrand1000m: countWithin(mainPois, target, 1000),
      competitor100m: countWithin(competitorPois, target, 100),
      competitor300m: countWithin(competitorPois, target, 300),
      competitor1000m: countWithin(competitorPois, target, params.radiusMeters),
    };

    const densityLevel = evaluateDensity(mainPois, target, 500);

    const generatedAt = Math.floor(Date.now() / 1000);

    logger.info(
      {
        city: params.city,
        mainBrand: params.mainBrand,
        competitorKeywords,
        counts,
        source,
      },
      "Target analysis computed"
    );

    return {
      city: params.city,
      target,
      mainBrand,
      mainBrandLabel,
      competitorKeywords,
      radiusMeters: params.radiusMeters,
      generatedAt,
      counts,
      densityLevel,
      source,
      samplePois: {
        mainBrand: mainPois.slice(0, 20),
        competitors: competitorPois.slice(0, 20),
      },
    };
  }

  private async ensurePois(
    city: string,
    keywords: string[],
    options: { allowNetworkFetch?: boolean } = {}
  ): Promise<{ poisByKeyword: Record<string, PoiRecord[]>; source: FetchSource }> {
    // 移除TTL限制，使用所有缓存数据，与POI管理界面保持一致
    const cacheHit = this.repo.getPois(city, keywords);
    const byKeyword = new Map<string, PoiRecord[]>();
    for (const keyword of keywords) {
      byKeyword.set(keyword, []);
    }

    for (const record of cacheHit) {
      const bucket = byKeyword.get(record.keyword);
      if (bucket) {
        bucket.push(record);
      }
    }

    const missingKeywords = keywords.filter((keyword) => {
      const bucket = byKeyword.get(keyword);
      return !bucket || bucket.length === 0;
    });

    let source: FetchSource = "cache";

    if (options.allowNetworkFetch && missingKeywords.length > 0) {
      if (!hasUsableApiKey(this.config.gaode.apiKey)) {
        throw new AppError("Gaode API key is not configured; please provide a valid key.", {
          status: 503,
          code: "gaode_api_key_missing",
        });
      }

      const fetchedRecords: PoiRecord[] = [];
      for (const keyword of missingKeywords) {
        let pois: GaodePoi[];
        try {
          pois = await this.provider.placeTextSearch({ keywords: keyword, city });
        } catch (error) {
          logger.error(
            { err: error, city, keyword },
            "Gaode API request failed while fetching POIs"
          );
          throw toProviderError(error);
        }
        const mapped = pois.map((poi) => mapPoiRecord(poi, keyword, city));
        fetchedRecords.push(...mapped);
        byKeyword.set(keyword, mapped);
      }

      if (fetchedRecords.length > 0) {
        this.repo.upsertPois(fetchedRecords);
        source = cacheHit.length > 0 ? "mixed" : "network";
      }
    }

    return {
      poisByKeyword: Object.fromEntries(byKeyword.entries()),
      source,
    };
  }

  async getPoiStats(city?: string): Promise<PoiCacheStatsResult> {
    const stats = this.repo.getKeywordStats(city);
    const total = stats.reduce((sum, item) => sum + item.count, 0);
    return {
      city: city ?? null,
      stats,
      total,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }

  async refreshPoiCache(city: string, keywords: string[]): Promise<PoiCacheRefreshResult> {
    const normalizedKeywords = normalizeKeywords(keywords);
    if (normalizedKeywords.length === 0) {
      throw new AppError("至少需要一个关键词", { status: 400, code: "invalid_keywords" });
    }

    if (!hasUsableApiKey(this.config.gaode.apiKey)) {
      throw new AppError("Gaode API key is not configured; please provide a valid key.", {
        status: 503,
        code: "gaode_api_key_missing",
      });
    }

    logger.info({ city, keywords: normalizedKeywords, count: normalizedKeywords.length }, "开始刷新POI缓存");
    
    const results: Array<{ keyword: string; fetched: number }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (const keyword of normalizedKeywords) {
      try {
        logger.info({ city, keyword, progress: `${results.length + 1}/${normalizedKeywords.length}` }, "正在获取POI数据");
        
        const pois = await this.provider.placeTextSearch({ keywords: keyword, city });
        const mapped = pois.map((poi) => mapPoiRecord(poi, keyword, city));
        this.repo.upsertPois(mapped);
        
        results.push({ keyword, fetched: mapped.length });
        successCount++;
        
        logger.info({ 
          city, 
          keyword, 
          fetched: mapped.length, 
          progress: `${results.length}/${normalizedKeywords.length}`,
          successCount,
          errorCount 
        }, "POI数据获取成功");
        
      } catch (error) {
        errorCount++;
        logger.error({ 
          city, 
          keyword, 
          error: error instanceof Error ? error.message : String(error),
          progress: `${results.length + 1}/${normalizedKeywords.length}`,
          successCount,
          errorCount 
        }, "POI数据获取失败");
        
        // 对于单个关键词失败，记录错误但继续处理其他关键词
        results.push({ keyword, fetched: 0 });
        
        // 如果是网络或API密钥问题，应该立即失败
        if (error instanceof Error && (
          error.message.includes('API key') ||
          error.message.includes('timeout') ||
          error.message.includes('network')
        )) {
          throw toProviderError(error);
        }
      }
    }

    const totalFetched = results.reduce((sum, item) => sum + item.fetched, 0);
    
    logger.info({ 
      city, 
      keywords: normalizedKeywords,
      totalKeywords: normalizedKeywords.length,
      successCount,
      errorCount,
      totalFetched,
      generatedAt: Math.floor(Date.now() / 1000)
    }, "POI缓存刷新完成");

    return {
      city,
      keywords: normalizedKeywords,
      totalFetched,
      generatedAt: Math.floor(Date.now() / 1000),
      results,
    };
  }
}

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0)
        .map((keyword) => keyword.toLowerCase())
    )
  );
}

function hashKey(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function mapPoiRecord(poi: GaodePoi, keyword: string, city: string): PoiRecord {
  return {
    keyword: keyword.toLowerCase(),
    city,
    poiId: poi.id,
    name: poi.name,
    category: poi.type,
    address: poi.address,
    longitude: poi.location.lng,
    latitude: poi.location.lat,
    rawJson: poi.raw,
    fetchedAt: Math.floor(Date.now() / 1000),
    fetchSource: "gaode",
  };
}

function dedupePois(pois: PoiRecord[]): PoiRecord[] {
  const map = new Map<string, PoiRecord>();
  for (const poi of pois) {
    map.set(poi.poiId, poi);
  }
  return Array.from(map.values());
}

function countWithin(records: PoiRecord[], target: { lng: number; lat: number }, radius: number): number {
  return records.filter((record) => {
    const distance = haversineDistanceMeters(
      { lng: record.longitude, lat: record.latitude },
      target
    );
    return distance <= radius;
  }).length;
}

function evaluateDensity(pois: PoiRecord[], target: { lng: number; lat: number }, gridSize: number): "high" | "medium" | "low" {
  const gridId = gridIdForPoint({ lng: target.lng, lat: target.lat }, gridSize);
  const gridCounts = aggregateToGrid(
    pois.map((poi) => ({ lng: poi.longitude, lat: poi.latitude })),
    gridSize
  );
  const cell = gridCounts.find((item) => item.gridId === gridId);
  if (!cell) {
    return "low";
  }
  if (cell.count >= 10) return "high";
  if (cell.count >= 4) return "medium";
  return "low";
}

function hasUsableApiKey(apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) return false;
  if (/REPLACE_WITH_GAODE_API_KEY/i.test(trimmed)) return false;
  return true;
}

function toProviderError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("has_exceeded_the_limit") || message.includes("CUQPS")) {
    return new AppError("高德接口调用频率超过限制，请稍后再试。", {
      status: 429,
      code: "gaode_rate_limit",
    });
  }

  if (message.toLowerCase().includes("fetch failed") || message.includes("ENOTFOUND")) {
    return new AppError(
      "无法连接高德服务，请检查网络或稍后重试。",
      { status: 503, code: "gaode_api_unavailable" }
    );
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return new AppError("高德接口请求超时，请稍后再试。", {
      status: 504,
      code: "gaode_api_timeout",
    });
  }
  return new AppError(`高德接口调用失败：${message}`, {
    status: 502,
    code: "gaode_api_error",
  });
}

function poiRecordToSummary(record: PoiRecord): PoiPointSummary {
  return {
    keyword: record.keyword,
    poiId: record.poiId,
    name: record.name ?? "",
    category: record.category ?? "",
    longitude: record.longitude,
    latitude: record.latitude,
    city: record.city,
    fetchedAt: record.fetchedAt,
  };
}
