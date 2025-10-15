import { Router } from "express";
import { z } from "zod";

import type { AppConfig } from "../settings/config.js";
import { PlanningService } from "../services/planningService.js";
import { isAppError } from "../utils/errors.js";
import { logger } from "../settings/logger.js";

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "颜色需要使用 HEX 格式，如 #22c55e")
  .optional();

const statusSchema = z.enum(["pending", "priority", "dropped"]).optional();
const sourceTypeSchema = z.enum(["poi", "manual"]).optional();

const createSchema = z.object({
  city: z.string().min(1, "城市不能为空"),
  name: z.string().min(1, "名称不能为空"),
  center: z.object({
    lng: z.number(),
    lat: z.number(),
  }),
  radiusMeters: z.number().int().min(100).max(2000).default(1000),
  color: hexColorSchema,
  colorToken: z.string().min(1).max(60).optional(),
  status: statusSchema,
  priorityRank: z.number().int().min(1).max(999).optional(),
  notes: z.string().max(2000).optional(),
  sourceType: sourceTypeSchema,
  sourcePoiId: z.string().max(120).nullable().optional(),
  updatedBy: z.string().max(120).nullable().optional(),
});

const updateSchema = z.object({
  city: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  center: z
    .object({
      lng: z.number(),
      lat: z.number(),
    })
    .optional(),
  radiusMeters: z.number().int().min(100).max(2000).optional(),
  color: hexColorSchema,
  colorToken: z.string().min(1).max(60).optional(),
  status: statusSchema,
  priorityRank: z.number().int().min(1).max(999).optional(),
  notes: z.string().max(2000).optional(),
  sourceType: sourceTypeSchema,
  sourcePoiId: z.string().max(120).nullable().optional(),
  updatedBy: z.string().max(120).nullable().optional(),
});

const listQuerySchema = z.object({
  city: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const candidate = Array.isArray(value) ? value[0] : value;
      const trimmed = candidate.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }),
});

const searchSchema = z.object({
  city: z.string().min(1),
  keyword: z.string().min(1),
  limit: z.number().int().min(1).max(12).optional(),
});

export function planningRouter(config: AppConfig): Router {
  const router = Router();
  const service = new PlanningService(config);

  router.get("/points", (req, res) => {
    try {
      const { city } = listQuerySchema.parse(req.query);
      const points = service.list(city);
      res.json(points);
    } catch (error) {
      handlePlanningError(res, error);
    }
  });

  router.post("/points", (req, res) => {
    try {
      const payload = createSchema.parse(req.body);
      const record = service.create({
        city: payload.city,
        name: payload.name,
        longitude: payload.center.lng,
        latitude: payload.center.lat,
        radiusMeters: payload.radiusMeters,
        color: payload.color,
        colorToken: payload.colorToken,
        status: payload.status,
        priorityRank: payload.priorityRank,
        notes: payload.notes,
        sourceType: payload.sourceType,
        sourcePoiId: payload.sourcePoiId,
        updatedBy: payload.updatedBy,
      });
      res.status(201).json(record);
    } catch (error) {
      handlePlanningError(res, error);
    }
  });

  router.put("/points/:id", (req, res) => {
    try {
      const payload = updateSchema.parse(req.body);
      const { center, ...rest } = payload;
      const updates = {
        ...rest,
        ...(center ? { longitude: center.lng, latitude: center.lat } : {}),
      };
      const record = service.update(req.params.id, updates);
      res.json(record);
    } catch (error) {
      handlePlanningError(res, error);
    }
  });

  router.delete("/points/:id", (req, res) => {
    try {
      service.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      handlePlanningError(res, error);
    }
  });

  router.post("/search", async (req, res) => {
    try {
      const payload = searchSchema.parse(req.body);
      const results = await service.searchPois(payload.city, payload.keyword, payload.limit ?? 8);
      res.json(results);
    } catch (error) {
      handlePlanningError(res, error);
    }
  });

  return router;
}

function handlePlanningError(res: any, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "validation_error", details: error.flatten() });
    return;
  }

  if (isAppError(error)) {
    logger.warn({ err: error }, "Handled planning route error");
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }

  logger.error({ err: error }, "Unhandled planning route error");
  res.status(500).json({ error: "internal_error", message: (error as Error).message ?? "Unknown error" });
}
