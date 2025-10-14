import { useEffect, useState } from "react";

interface LoaderState {
  AMap: any | null;
  error: Error | null;
}

const loaderState: LoaderState = {
  AMap: typeof window !== "undefined" ? (window as any).AMap ?? null : null,
  error: null,
};

let pendingPromise: Promise<any> | null = null;

function ensureSecurityConfig(): void {
  if (typeof window === "undefined") return;
  const defaultServiceHost = `${window.location.origin}/_AMapService`;
  const serviceHost =
    (import.meta.env.VITE_AMAP_SERVICE_HOST as string | undefined) ?? defaultServiceHost;
  const securityJsCode = import.meta.env.VITE_GAODE_SECURITY_JS_CODE as string | undefined;

  const currentConfig = ((window as any)._AMapSecurityConfig ?? {}) as Record<string, unknown>;
  currentConfig.serviceHost = serviceHost;
  if (securityJsCode && securityJsCode.trim().length > 0) {
    currentConfig.securityJsCode = securityJsCode.trim();
  }
  (window as any)._AMapSecurityConfig = currentConfig;
}

export function useAmapLoader(): LoaderState {
  const [state, setState] = useState<LoaderState>({ AMap: loaderState.AMap, error: null });

  useEffect(() => {
    if (loaderState.AMap || loaderState.error) {
      setState({ AMap: loaderState.AMap, error: loaderState.error });
      return;
    }

    if (!pendingPromise) {
      const apiKey = import.meta.env.VITE_GAODE_KEY as string | undefined;
      if (!apiKey) {
        loaderState.error = new Error("缺少 VITE_GAODE_KEY 配置");
        setState({ AMap: null, error: loaderState.error });
        return;
      }

      pendingPromise = new Promise((resolve, reject) => {
        ensureSecurityConfig();
        const script = document.createElement("script");
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${apiKey}&plugin=AMap.PlaceSearch,AMap.CircleEditor`;
        script.async = true;
        script.onload = () => {
          loaderState.AMap = (window as any).AMap;
          resolve(loaderState.AMap);
        };
        script.onerror = () => {
          const error = new Error("高德地图脚本加载失败");
          loaderState.error = error;
          reject(error);
        };
        document.head.appendChild(script);
      });
    }

    pendingPromise
      ?.then((AMap) => {
        setState({ AMap, error: null });
      })
      .catch((error) => {
        setState({ AMap: null, error: error as Error });
      });
  }, []);

  return state;
}
