import { PoiService } from "./poiService.js";
import type { PoiCacheStatsResult } from "./poiService.js";
import type { AppConfig } from "../settings/config.js";
import { PoiCacheRepository } from "../storage/poiCacheRepository.js";

/**
 * 增强的POI服务，提供一致的查询逻辑
 */
export class PoiServiceEnhanced extends PoiService {
  constructor(config: AppConfig) {
    super(config);
  }

  // 暴露受保护的config属性给子类使用
  protected get serviceConfig(): AppConfig {
    return (this as any).config;
  }

  /**
   * 获取POI统计（忽略TTL限制，与管理界面保持一致）
   */
  async getPoiStatsConsistent(city?: string): Promise<PoiCacheStatsResult> {
    const repo = new PoiCacheRepository(this.serviceConfig.databasePath);
    
    // 直接查询所有数据，不受TTL限制
    const stats = repo.getKeywordStats(city);
    const total = stats.reduce((sum, item) => sum + item.count, 0);
    
    return {
      city: city ?? null,
      stats,
      total,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * 热力图分析（无TTL限制版本）
   */
  async loadBrandDensity(params: any): Promise<any> {
    // 直接调用父类方法，但由于ensurePois已经被重写，这里会使用无TTL限制的数据
    return super.loadBrandDensity(params);
  }

  /**
   * 获取详细的数据分布信息（用于调试）
   */
  async getDataDistributionAnalysis(city?: string): Promise<{
    totalRecords: number;
    validRecords: number;
    expiredRecords: number;
    keywordDistribution: Array<{
      keyword: string;
      total: number;
      valid: number;
      expired: number;
    }>;
    timeDistribution: Array<{
      ageHours: number;
      count: number;
    }>;
  }> {
    const repo = new PoiCacheRepository(this.serviceConfig.databasePath);
    
    // 获取所有数据
    const allRecords = repo.getAllPois(city);
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = this.serviceConfig.cacheTtlSeconds;
    
    // 分析数据时效性
    const validRecords = allRecords.filter(r => r.fetchedAt >= now - ttlSeconds);
    const expiredRecords = allRecords.filter(r => r.fetchedAt < now - ttlSeconds);
    
    // 按关键词分组分析
    const keywordMap = new Map<string, { total: number; valid: number; expired: number }>();
    
    for (const record of allRecords) {
      const keyword = record.keyword;
      if (!keywordMap.has(keyword)) {
        keywordMap.set(keyword, { total: 0, valid: 0, expired: 0 });
      }
      const stats = keywordMap.get(keyword)!;
      stats.total++;
      
      if (record.fetchedAt >= now - ttlSeconds) {
        stats.valid++;
      } else {
        stats.expired++;
      }
    }
    
    // 时间分布分析
    const timeDistribution = new Map<number, number>();
    for (const record of allRecords) {
      const ageHours = Math.floor((now - record.fetchedAt) / 3600);
      const ageRange = Math.floor(ageHours / 24) * 24; // 按天分组
      timeDistribution.set(ageRange, (timeDistribution.get(ageRange) || 0) + 1);
    }
    
    return {
      totalRecords: allRecords.length,
      validRecords: validRecords.length,
      expiredRecords: expiredRecords.length,
      keywordDistribution: Array.from(keywordMap.entries()).map(([keyword, stats]) => ({
        keyword,
        ...stats
      })).sort((a, b) => b.total - a.total),
      timeDistribution: Array.from(timeDistribution.entries())
        .map(([ageHours, count]) => ({ ageHours, count }))
        .sort((a, b) => a.ageHours - b.ageHours)
    };
  }
}