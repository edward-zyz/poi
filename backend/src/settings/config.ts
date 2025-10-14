import fs from "node:fs";
import path from "node:path";

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

function readGaodeConfig(): GaodeConfig {
  const localConfigPath = process.env.GAODE_CONFIG_PATH
    ? path.resolve(process.env.GAODE_CONFIG_PATH)
    : path.resolve(process.cwd(), "config", "gaode.config.json");

  if (!fs.existsSync(localConfigPath)) {
    throw new Error(`Missing Gaode config file at ${localConfigPath}`);
  }

  const raw = fs.readFileSync(localConfigPath, "utf-8");
  const parsed = JSON.parse(raw);

  return rawConfigSchema.parse(parsed);
}

export function loadConfig(): AppConfig {
  const pkgJsonPath = path.resolve(process.cwd(), "package.json");
  const pkgRaw = fs.readFileSync(pkgJsonPath, "utf-8");
  const pkg = JSON.parse(pkgRaw) as { version?: string };

  const gaodeConfig = readGaodeConfig();
  const injectedKey =
    process.env.GAODE_API_KEY && process.env.GAODE_API_KEY.trim().length > 0
      ? process.env.GAODE_API_KEY.trim()
      : gaodeConfig.apiKey;

  if (!injectedKey) {
    // Warn but not throw to allow tests to inject mocks.
    console.warn(
      "[config] No Gaode API key detected. Set GAODE_API_KEY env var or fill config/gaode.config.json."
    );
  }

  const securityJsCode =
    process.env.GAODE_SECURITY_JS_CODE && process.env.GAODE_SECURITY_JS_CODE.trim().length > 0
      ? process.env.GAODE_SECURITY_JS_CODE.trim()
      : gaodeConfig.securityJsCode ?? "";

  const timeoutMsEnv = process.env.GAODE_TIMEOUT_MS ? Number(process.env.GAODE_TIMEOUT_MS) : NaN;
  const timeoutMs = Number.isFinite(timeoutMsEnv) && timeoutMsEnv > 0 ? timeoutMsEnv : gaodeConfig.timeoutMs;

  const port = Number(process.env.PORT ?? 4000);
  const cacheTtlHours = Number(process.env.CACHE_TTL_HOURS ?? DEFAULT_CACHE_TTL_HOURS);
  const databasePath =
    process.env.SQLITE_DB_PATH ??
    (process.env.NODE_ENV === "test" ? path.resolve(process.cwd(), "storage", "test.sqlite") : FALLBACK_DB);

  return {
    version: pkg.version ?? "0.0.0",
    port,
    cacheTtlHours,
    cacheTtlSeconds: cacheTtlHours * 3600,
    databasePath,
    gaode: { ...gaodeConfig, apiKey: injectedKey, securityJsCode, timeoutMs },
  };
}
