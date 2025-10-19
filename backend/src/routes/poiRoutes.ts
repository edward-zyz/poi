import { Router } from "express";
import { z } from "zod";

import type { AppConfig } from "../settings/config.js";
import { PoiService } from "../services/poiService.js";
import { PoiServiceEnhanced } from "../services/poiServiceEnhanced.js";
import { isAppError } from "../utils/errors.js";
import { logger } from "../settings/logger.js";

const densitySchema = z.object({
  city: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  mainBrand: z.string().optional(),
  useTtl: z.boolean().optional().default(false),
});

const analysisSchema = z.object({
  city: z.string().min(1),
  mainBrand: z.string().min(1),
  competitorKeywords: z.array(z.string()).default([]),
  radiusMeters: z.number().int().positive().default(1000),
  target: z.object({
    lng: z.number(),
    lat: z.number(),
  }),
});

const cacheStatsQuerySchema = z.object({
  city: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const str = Array.isArray(value) ? value[0] : value;
      const trimmed = str.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  useTtl: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return false; // 默认不使用TTL
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    }),
});

const cacheRefreshSchema = z.object({
  city: z.string().min(1),
  keywords: z.array(z.string()).min(1),
});

export function poiRouter(config: AppConfig): Router {
  const router = Router();
  const service = new PoiService(config);
  const enhancedService = new PoiServiceEnhanced(config);

  router.post("/density", async (req, res) => {
    try {
      const payload = densitySchema.parse(req.body);
      const result = await service.loadBrandDensity(payload);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/analysis", async (req, res) => {
    try {
      const payload = analysisSchema.parse(req.body);
      const result = await service.analyzeTargetPoint(payload);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/cache/stats", async (req, res) => {
    try {
      const { city, useTtl } = cacheStatsQuerySchema.parse(req.query);
      const result = useTtl 
        ? await service.getPoiStats(city) // 使用TTL限制
        : await enhancedService.getPoiStatsConsistent(city); // 不使用TTL限制
      res.json({
        ...result,
        meta: {
          useTtl,
          note: useTtl ? "使用TTL限制，只显示有效期内数据" : "忽略TTL限制，显示所有缓存数据"
        }
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // 数据一致性检查接口
  router.get("/cache/consistency-check", async (req, res) => {
    try {
      const { city } = cacheStatsQuerySchema.parse(req.query);
      const [normalStats, consistentStats, distribution] = await Promise.all([
        service.getPoiStats(city),
        enhancedService.getPoiStatsConsistent(city),
        enhancedService.getDataDistributionAnalysis(city)
      ]);
      
      res.json({
        city,
        timestamp: Math.floor(Date.now() / 1000),
        comparison: {
          withTtl: {
            total: normalStats.total,
            keywords: normalStats.stats.length
          },
          withoutTtl: {
            total: consistentStats.total,
            keywords: consistentStats.stats.length
          },
          difference: {
            total: consistentStats.total - normalStats.total,
            keywords: consistentStats.stats.length - normalStats.stats.length
          }
        },
        distribution,
        recommendations: generateRecommendations(distribution)
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // 带TTL选项的热力图分析接口
  router.post("/density/with-ttl-option", async (req, res) => {
    try {
      const payload = densitySchema.parse(req.body);
      const { useTtl, ...densityParams } = payload;
      
      let result;
      if (useTtl) {
        // 使用原来的逻辑（有TTL限制）
        result = await service.loadBrandDensity(densityParams);
      } else {
        // 使用新的逻辑（无TTL限制）
        result = await enhancedService.loadBrandDensity(densityParams);
      }
      
      res.json({
        ...result,
        meta: {
          useTtl: useTtl || false,
          note: useTtl ? "使用TTL限制的数据进行热力图分析" : "使用所有缓存数据进行热力图分析"
        }
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/cache/refresh", async (req, res) => {
    try {
      const payload = cacheRefreshSchema.parse(req.body);
      
      // 设置流式响应头，避免超时
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      // 开始流式响应
      res.write('{"status":"started","message":"开始刷新POI缓存...","progress":0}\n');
      // res.flush?.(); // Node.js的Response对象没有flush方法
      
      const result = await service.refreshPoiCacheWithProgress(
        payload.city, 
        payload.keywords,
        (progress: number, message: string, keyword?: string) => {
          // 发送进度更新
          const update = {
            status: "progress",
            message,
            progress,
            currentKeyword: keyword,
            timestamp: Date.now()
          };
          res.write(`${JSON.stringify(update)}\n`);
          // res.flush?.(); // Node.js的Response对象没有flush方法
        }
      );
      
      // 发送最终结果
      res.write(`${JSON.stringify({status:"completed",...result})}\n`);
      res.end();
    } catch (error) {
      // 发送错误信息
      try {
        const errorResponse = {
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now()
        };
        res.write(`${JSON.stringify(errorResponse)}\n`);
        res.end();
      } catch (writeError) {
        // 如果响应已经关闭，只能记录日志
        logger.error({ err: error }, "POI cache refresh failed");
      }
    }
  });

  return router;
}

function generateRecommendations(distribution: any): string[] {
  const recommendations: string[] = [];
  const { totalRecords, validRecords, expiredRecords, keywordDistribution, timeDistribution } = distribution;
  
  // 数据时效性建议
  if (expiredRecords > 0) {
    const expiredPercentage = (expiredRecords / totalRecords * 100).toFixed(1);
    recommendations.push(`${expiredPercentage}% 的POI数据已过期，建议刷新缓存`);
  }
  
  // 时间分布建议
  const oldData = timeDistribution.filter((t: any) => t.ageHours > 168); // 超过7天
  if (oldData.length > 0) {
    recommendations.push("部分POI数据超过7天，建议考虑延长TTL或定期刷新");
  }
  
  // 关键词分布建议
  const zeroValidKeywords = keywordDistribution.filter((k: any) => k.valid === 0);
  if (zeroValidKeywords.length > 0) {
    const keywordNames = zeroValidKeywords.map((k: any) => k.keyword).join(", ");
    recommendations.push(`关键词 ${keywordNames} 的数据已全部过期，需要重新获取`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push("数据状态良好，无特殊建议");
  }
  
  return recommendations;
}

function handleError(res: any, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "validation_error", details: error.flatten() });
    return;
  }

  if (isAppError(error)) {
    logger.warn({ err: error }, "Handled application error");
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }

  logger.error({ err: error }, "Unhandled error in POI route");
  const message = (error as Error).message ?? "Unknown error";
  res.status(500).json({ error: "internal_error", message });
}
