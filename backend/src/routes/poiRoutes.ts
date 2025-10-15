import { Router } from "express";
import { z } from "zod";

import type { AppConfig } from "../settings/config.js";
import { PoiService } from "../services/poiService.js";
import { isAppError } from "../utils/errors.js";
import { logger } from "../settings/logger.js";

const densitySchema = z.object({
  city: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  mainBrand: z.string().optional(),
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
});

const cacheRefreshSchema = z.object({
  city: z.string().min(1),
  keywords: z.array(z.string()).min(1),
});

export function poiRouter(config: AppConfig): Router {
  const router = Router();
  const service = new PoiService(config);

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
      const { city } = cacheStatsQuerySchema.parse(req.query);
      const result = await service.getPoiStats(city);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/cache/refresh", async (req, res) => {
    try {
      const payload = cacheRefreshSchema.parse(req.body);
      
      // 设置响应头以支持长时间运行的请求
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Cache-Control', 'no-cache');
      
      const result = await service.refreshPoiCache(payload.city, payload.keywords);
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
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
