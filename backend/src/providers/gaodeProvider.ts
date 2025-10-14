import { URLSearchParams } from "node:url";

import type { GaodeConfig } from "../settings/config.js";
import { RateLimiter } from "../utils/limiter.js";

export interface GaodePoi {
  id: string;
  name: string;
  type: string;
  address: string;
  location: {
    lng: number;
    lat: number;
  };
  city: string;
  adcode?: string;
  raw: unknown;
}

export interface PlaceSearchParams {
  keywords: string;
  city: string;
  page?: number;
  offset?: number;
}

export interface PlaceAroundParams {
  location: { lng: number; lat: number };
  radius: number;
  keywords?: string;
  page?: number;
  offset?: number;
}

export interface GaodeProviderOptions {
  config: GaodeConfig & { apiKey: string };
  fetcher?: typeof fetch;
}

export class GaodeProvider {
  private readonly config: GaodeConfig & { apiKey: string };
  private readonly fetcher: typeof fetch;
  private readonly limiter: RateLimiter;

  constructor(options: GaodeProviderOptions) {
    this.config = options.config;
    this.fetcher = options.fetcher ?? fetch;
    this.limiter = new RateLimiter(this.config.rateLimit?.requestsPerMinute ?? 0);
  }

  async placeTextSearch(params: PlaceSearchParams): Promise<GaodePoi[]> {
    const collected: GaodePoi[] = [];
    const pageSize = Math.min(params.offset ?? 25, 25);
    const maxPageLimit = 100; // per Gaode docs, page value 1-100
    let totalPages = maxPageLimit;

    for (let page = 1; page <= Math.min(totalPages, maxPageLimit); page += 1) {
      await this.limiter.wait();
      const response = await this.callService(this.config.services.placeSearch, {
        keywords: params.keywords,
        city: params.city,
        citylimit: "true",
        offset: String(pageSize),
        page: String(page),
        extensions: "base",
      });

      if (page === 1) {
        const totalCount = Number(response.count ?? 0);
        if (Number.isFinite(totalCount) && totalCount > 0) {
          totalPages = Math.ceil(totalCount / pageSize);
        } else {
          totalPages = 1;
        }
      }

      const pois = this.normalizePois(response, params.city);
      collected.push(...pois);

      const reachedEnd = !response.pois || response.pois.length < pageSize;
      if (reachedEnd || page >= totalPages) {
        break;
      }
    }

    return collected;
  }

  async placeAround(params: PlaceAroundParams): Promise<GaodePoi[]> {
    const pageSize = Math.min(params.offset ?? 25, 25);
    const maxPageLimit = 50; // around search up to 50 pages per docs
    let totalPages = maxPageLimit;
    const collected: GaodePoi[] = [];
    const baseParams: Record<string, string> = {
      location: `${params.location.lng},${params.location.lat}`,
      radius: String(params.radius),
      extensions: "base",
      offset: String(pageSize),
    };
    if (params.keywords) {
      baseParams.keywords = params.keywords;
    }

    for (let page = 1; page <= Math.min(totalPages, maxPageLimit); page += 1) {
      await this.limiter.wait();
      const response = await this.callService(this.config.services.placeAround, {
        ...baseParams,
        page: String(page),
      });

      if (page === 1) {
        const totalCount = Number(response.count ?? 0);
        if (Number.isFinite(totalCount) && totalCount > 0) {
          totalPages = Math.ceil(totalCount / pageSize);
        } else {
          totalPages = 1;
        }
      }

      const pois = this.normalizePois(response);
      collected.push(...pois);

      const reachedEnd = !response.pois || response.pois.length < pageSize;
      if (reachedEnd || page >= totalPages) {
        break;
      }
    }

    return collected;
  }

  private async callService(endpoint: string, params: Record<string, string>): Promise<any> {
    if (!this.config.apiKey) {
      throw new Error("Missing Gaode API key");
    }

    const searchParams = new URLSearchParams({
      key: this.config.apiKey,
      ...params,
    });
    const url = `${this.config.baseUrl}${endpoint}?${searchParams.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);

    try {
      const response = await this.fetcher(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Gaode API error: ${response.status} ${body}`);
      }

      const data = (await response.json()) as any;
      if (data.status !== "1") {
        throw new Error(`Gaode API returned error: ${JSON.stringify(data)}`);
      }
      return data;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error("Gaode API request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizePois(response: any, fallbackCity?: string): GaodePoi[] {
    if (!response || !Array.isArray(response.pois)) return [];

    return response.pois.map((poi: any) => {
      const [lngStr, latStr] = (poi.location ?? "0,0").split(",");
      return {
        id: poi.id ?? poi.poiid ?? `${poi.name}-${poi.location}`,
        name: poi.name ?? "未知",
        type: poi.type ?? "",
        address: poi.address ?? "",
        city: poi.cityname ?? fallbackCity ?? "",
        adcode: poi.adcode,
        location: {
          lng: Number(lngStr) || 0,
          lat: Number(latStr) || 0,
        },
        raw: poi,
      };
    });
  }
}
