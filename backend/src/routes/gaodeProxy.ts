import type { Request, Response } from "express";
import { Router } from "express";
import https from "node:https";
import { URL } from "node:url";

import type { AppConfig } from "../settings/config.js";
import { logger } from "../settings/logger.js";

const REST_API_BASE = "https://restapi.amap.com";

function buildTargetUrl(originalUrl: string, securityJsCode: string | undefined): URL {
  const sanitized = originalUrl.replace(/^\/_AMapService/, "") || "/";
  const targetUrl = new URL(sanitized, REST_API_BASE);
  if (securityJsCode && securityJsCode.trim().length > 0) {
    targetUrl.searchParams.set("jscode", securityJsCode.trim());
  }
  return targetUrl;
}

export function createGaodeProxyRouter(config: AppConfig): Router {
  const router = Router();

  router.use((req: Request, res: Response) => {
    const targetUrl = buildTargetUrl(req.originalUrl, config.gaode.securityJsCode);

    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    delete headers.origin;
    delete headers.referer;

    const options: https.RequestOptions = {
      method: req.method,
      headers,
    };

    const upstreamReq = https.request(targetUrl, options, (upstreamRes) => {
      res.status(upstreamRes.statusCode ?? 502);
      Object.entries(upstreamRes.headers).forEach(([key, value]) => {
        if (!value) return;
        if (Array.isArray(value)) {
          res.setHeader(key, value);
        } else if (!["transfer-encoding", "content-encoding"].includes(key)) {
          res.setHeader(key, value);
        }
      });
      upstreamRes.pipe(res);
    });

    upstreamReq.on("error", (error) => {
      logger.error({ err: error, target: targetUrl.toString() }, "Gaode proxy request failed");
      if (!res.headersSent) {
        res.status(502).json({ error: "gaode_proxy_error", message: "高德代理服务异常，请稍后重试。" });
      } else {
        res.end();
      }
    });

    if (["GET", "HEAD"].includes(req.method.toUpperCase())) {
      upstreamReq.end();
    } else if (req.readable) {
      req.pipe(upstreamReq);
    } else if (req.body && Object.keys(req.body).length > 0) {
      const body = JSON.stringify(req.body);
      upstreamReq.setHeader("content-type", "application/json");
      upstreamReq.end(body);
    } else {
      upstreamReq.end();
    }
  });

  return router;
}
