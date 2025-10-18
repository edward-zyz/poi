import path from "node:path";
import fs from "node:fs";

import { z } from "zod";

const rawConfigSchema = z.object({
  mapProvider: z.literal("gaode"),
  apiKey: z.string().default(""),
  baseUrl: z.string().url(),
  services: z.object({
    placeSearch: z.string(),
    placeAround: z.string(),
  }),
  timeoutMs: z.number().positive().default(5000),
  rateLimit: z.object({
    requestsPerMinute: z.number().positive().default(50),
  }),
  securityJsCode: z.string().optional().default(""),
});

export type GaodeConfig = z.infer<typeof rawConfigSchema>;

export interface AppConfig {
  version: string;
  port: number;
  cacheTtlHours: number;
  cacheTtlSeconds: number;
  databasePath: string;
  gaode: GaodeConfig & { apiKey: string; securityJsCode: string };
}

const DEFAULT_CACHE_TTL_HOURS = 24;
const FALLBACK_DB = path.resolve(process.cwd(), "storage", "poi-cache.sqlite");
const DEFAULT_GAODE_BASE_URL = "https://restapi.amap.com";
const DEFAULT_GAODE_PLACE_SEARCH = "/v3/place/text";
const DEFAULT_GAODE_PLACE_AROUND = "/v3/place/around";
const DEFAULT_GAODE_TIMEOUT_MS = 600000;
const DEFAULT_GAODE_RATE_LIMIT = 50;

function toPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function loadGaodeConfigFromEnv(): GaodeConfig {
  const timeoutMs = toPositiveInteger(process.env.GAODE_TIMEOUT_MS, DEFAULT_GAODE_TIMEOUT_MS);
  const rateLimit = toPositiveInteger(
    process.env.GAODE_RATE_LIMIT,
    DEFAULT_GAODE_RATE_LIMIT
  );

  return rawConfigSchema.parse({
    mapProvider: "gaode",
    apiKey: process.env.GAODE_API_KEY ?? "",
    baseUrl: process.env.GAODE_BASE_URL ?? DEFAULT_GAODE_BASE_URL,
    services: {
      placeSearch: process.env.GAODE_PLACE_SEARCH ?? DEFAULT_GAODE_PLACE_SEARCH,
      placeAround: process.env.GAODE_PLACE_AROUND ?? DEFAULT_GAODE_PLACE_AROUND,
    },
    timeoutMs,
    rateLimit: {
      requestsPerMinute: rateLimit,
    },
    securityJsCode: process.env.GAODE_SECURITY_JS_CODE ?? "",
  });
}

export function loadConfig(): AppConfig {
  const pkgJsonPath = path.resolve(process.cwd(), "package.json");
  const pkgRaw = fs.readFileSync(pkgJsonPath, "utf-8");
  const pkg = JSON.parse(pkgRaw) as { version?: string };

  const gaodeConfig = loadGaodeConfigFromEnv();
  const injectedKey = gaodeConfig.apiKey.trim();

  if (!injectedKey) {
    // Warn but not throw to allow tests to inject mocks.
    console.warn(
      "[config] No Gaode API key detected. Set GAODE_API_KEY environment variable before starting the service."
    );
  }

  const securityJsCode = gaodeConfig.securityJsCode?.trim() ?? "";

  const port = Number(process.env.PORT ?? 4000);
  const cacheTtlHours = Number(process.env.CACHE_TTL_HOURS ?? DEFAULT_CACHE_TTL_HOURS);
  
  // 检测Railway环境
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_VOLUME_MOUNT_PATH;
  
  const databasePath =
    process.env.SQLITE_DB_PATH ??
    (process.env.NODE_ENV === "test" 
      ? path.resolve(process.cwd(), "storage", "test.sqlite") 
      : (isRailway 
          ? "/app/storage/poi-cache.sqlite"  // Railway Volume path
          : FALLBACK_DB));

  return {
    version: pkg.version ?? "0.0.0",
    port,
    cacheTtlHours,
    cacheTtlSeconds: cacheTtlHours * 3600,
    databasePath,
    gaode: { ...gaodeConfig, apiKey: injectedKey, securityJsCode },
  };
}
