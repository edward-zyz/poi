import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import type { AppConfig } from "../src/settings/config.js";
import { ensureMigrations } from "../src/storage/migrations.js";
import { closeConnection } from "../src/storage/db.js";
import type { PoiProvider } from "../src/services/poiService.js";
import { PoiService } from "../src/services/poiService.js";
import { AppError } from "../src/utils/errors.js";

const testDbPath = path.resolve(process.cwd(), "storage", "test.sqlite");

const city = "上海市";

function createConfig(): AppConfig {
  return {
    version: "test",
    port: 0,
    cacheTtlHours: 24,
    cacheTtlSeconds: 24 * 3600,
    databasePath: testDbPath,
    gaode: {
      mapProvider: "gaode",
      apiKey: "test-key",
      baseUrl: "https://restapi.amap.com",
      services: {
        placeSearch: "/v3/place/text",
        placeAround: "/v3/place/around",
      },
      timeoutMs: 5000,
      rateLimit: {
        requestsPerMinute: 2000,
      },
      securityJsCode: "test-security-code",
    },
  };
}

const MOCK_DATA: Record<
  string,
  Array<{
    id: string;
    name: string;
    type: string;
    address: string;
    location: { lng: number; lat: number };
    city: string;
    raw: unknown;
  }>
> = {
  "喜茶": [
    {
      id: "poi-1",
      name: "喜茶 上海环贸店",
      type: "茶饮",
      address: "黄浦区淮海中路 999 号",
      location: { lng: 121.464, lat: 31.215 },
      city,
      raw: { id: "poi-1" },
    },
    {
      id: "poi-2",
      name: "喜茶 上海徐家汇店",
      type: "茶饮",
      address: "徐汇区漕溪北路 88 号",
      location: { lng: 121.439, lat: 31.2005 },
      city,
      raw: { id: "poi-2" },
    },
  ],
  "奈雪的茶": [
    {
      id: "poi-3",
      name: "奈雪的茶 上海港汇恒隆广场店",
      type: "茶饮",
      address: "徐汇区虹桥路 1 号",
      location: { lng: 121.437, lat: 31.198 },
      city,
      raw: { id: "poi-3" },
    },
  ],
};

const mockProvider: PoiProvider = {
  async placeTextSearch({ keywords }) {
    const key = keywords.toLowerCase();
    return MOCK_DATA[key] ?? [];
  },
};

test.describe("PoiService", () => {
  test.beforeEach(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath);
    }
    await ensureMigrations(testDbPath);
  });

  test.after(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath);
    }
  });

  test.afterEach(() => {
    closeConnection(testDbPath);
  });

  test("loadBrandDensity aggregates POIs and caches results", async () => {
    const config = createConfig();
    const service = new PoiService(config, { provider: mockProvider });
    try {
      const result = await service.loadBrandDensity({ city, keywords: ["喜茶"], mainBrand: "喜茶" });

      assert.equal(result.totalPois, 2);
      assert.equal(result.keywords[0], "喜茶");
      assert.equal(result.source, "network");
      assert.ok(result.heatmap.length > 0);

      // Second call should hit cache
      const again = await service.loadBrandDensity({ city, keywords: ["喜茶"], mainBrand: "喜茶" });
      assert.equal(again.source, "cache");
    } catch (error) {
      console.error("loadBrandDensity test failed", error);
      throw error;
    }
  });

  test("analyzeTargetPoint computes brand counts within radius", async () => {
    const config = createConfig();
    const service = new PoiService(config, { provider: mockProvider });
    try {
      const result = await service.analyzeTargetPoint({
        city,
        mainBrand: "喜茶",
        competitorKeywords: ["奈雪的茶"],
        radiusMeters: 1000,
        target: { lng: 121.438, lat: 31.199 },
      });

      assert.equal(result.counts.mainBrand500m, 1);
      assert.equal(result.counts.mainBrand1000m, 1);
      assert.equal(result.counts.competitor100m, 0);
      assert.equal(result.counts.competitor1000m, 1);
      assert.equal(result.source, "network");
      assert.equal(result.mainBrandLabel, "喜茶");
    } catch (error) {
      console.error("analyzeTargetPoint test failed", error);
      throw error;
    }
  });

  test("throws informative error when Gaode API key missing", async () => {
    const config = createConfig();
    config.gaode.apiKey = "";
    const service = new PoiService(config, { provider: mockProvider });

    await assert.rejects(
      () => service.loadBrandDensity({ city, keywords: ["喜茶"], mainBrand: "喜茶" }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.status, 503);
        assert.equal(error.code, "gaode_api_key_missing");
        return true;
      }
    );
  });

  test("getPoiStats aggregates cached keywords", async () => {
    const config = createConfig();
    const service = new PoiService(config, { provider: mockProvider });
    await service.loadBrandDensity({ city, keywords: ["喜茶"], mainBrand: "喜茶" });
    const stats = await service.getPoiStats(city);
    assert.equal(stats.total, 2);
    assert.ok(stats.stats.find((item) => item.keyword === "喜茶"));
  });

  test("refreshPoiCache updates entries for given keywords", async () => {
    const config = createConfig();
    const service = new PoiService(config, { provider: mockProvider });
    const refreshResult = await service.refreshPoiCache(city, ["奈雪的茶"]);
    assert.equal(refreshResult.totalFetched, 1);
    const stats = await service.getPoiStats(city);
    const row = stats.stats.find((item) => item.keyword === "奈雪的茶");
    assert.ok(row);
    assert.equal(row?.count, 1);
  });
});
