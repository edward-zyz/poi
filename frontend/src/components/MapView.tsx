import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { fetchTargetAnalysis } from "../services/api";
import { usePoiStore } from "../store/usePoiStore";
import { parseKeywords } from "../utils/keywords";
import { useAmapLoader } from "../hooks/useAmapLoader";

const CITY_CENTERS: Record<string, [number, number]> = {
  上海市: [121.4737, 31.2304],
  北京市: [116.4074, 39.9042],
  广州市: [113.2644, 23.1291],
  深圳市: [114.0596, 22.5431],
  杭州市: [120.1536, 30.2875],
  成都市: [104.0668, 30.5728],
};

const DEFAULT_CENTER: [number, number] = [116.4074, 39.9042];

export function MapView(): JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef({
    heatmap: [] as any[],
    mainMarkers: [] as any[],
    competitorMarkers: [] as any[],
    targetCircle: null as any,
    baseMainMarkers: [] as any[],
    baseCompetitorMarkers: [] as any[],
  });
  const infoWindowRef = useRef<any>(null);
  const heatmapRef = useRef<any>(null);

  const { AMap, error } = useAmapLoader();
  const {
    city,
    competitorInput,
    mainBrandInput,
    densityResult,
    analysisResult,
    setAnalysisResult,
    setTargetPoint,
    showHeatmap,
    showMainPois,
    showCompetitorPois,
    heatmapRadius,
    heatmapOpacity,
  } = usePoiStore();

  const analysisMutation = useMutation({
    mutationFn: fetchTargetAnalysis,
    onSuccess: (result) => {
      setAnalysisResult(result);
      if (typeof window !== "undefined") {
        (window as any).lastAnalysisResult = result;
      }
      // eslint-disable-next-line no-console
      console.info("[UI] Target analysis updated", {
        mainBrand: result.mainBrandLabel,
        counts: result.counts,
        source: result.source,
      });
    },
  });

  const renderHeatmap = useCallback(
    (map: any, data: typeof densityResult) => {
      if (!map || !AMap) return;
      const heatmap = heatmapRef.current;
      if (!heatmap) {
        return;
      }
      const applyDataset = (heatmap: any) => {
        if (!heatmap || typeof heatmap.setDataSet !== "function") {
          return;
        }
        if (!showHeatmap || !data) {
          heatmap.hide?.();
          overlaysRef.current.heatmap = [];
          return;
        }
        const dataset =
          data.allPois?.map((poi) => ({
            lng: poi.longitude,
            lat: poi.latitude,
            count: 1,
          })) ?? [];
        const maxCount = data.heatmap.length
          ? Math.max(...data.heatmap.map((cell) => cell.count))
          : dataset.length > 0
          ? 1
          : 0;
        heatmap.setDataSet?.({
          data: dataset,
          max: Math.max(maxCount, 1),
        });
        heatmap.setOptions?.({
          radius: heatmapRadius,
          opacity: [Math.max(heatmapOpacity - 0.4, 0.05), heatmapOpacity],
          zIndex: 5,
        });
        heatmap.show?.();
        overlaysRef.current.heatmap = [heatmap];
        if (typeof window !== "undefined") {
          (window as any).lastHeatmapRange = { totalPoints: dataset.length, maxCount };
        }
      };

      applyDataset(heatmap);
    },
    [AMap, showHeatmap, heatmapRadius, heatmapOpacity]
  );

  const clearTargetOverlays = useCallback((map: any) => {
    const overlays = overlaysRef.current;
    if (overlays.mainMarkers.length) {
      map.remove(overlays.mainMarkers);
      overlays.mainMarkers = [];
    }
    if (overlays.competitorMarkers.length) {
      map.remove(overlays.competitorMarkers);
      overlays.competitorMarkers = [];
    }
    if (overlays.targetCircle) {
      map.remove(overlays.targetCircle);
      overlays.targetCircle = null;
    }
  }, []);

  const clearBaseMarkers = useCallback((map: any) => {
    const overlays = overlaysRef.current;
    if (overlays.baseMainMarkers.length) {
      map.remove(overlays.baseMainMarkers);
      overlays.baseMainMarkers = [];
    }
    if (overlays.baseCompetitorMarkers.length) {
      map.remove(overlays.baseCompetitorMarkers);
      overlays.baseCompetitorMarkers = [];
    }
  }, []);

  const renderTargetAnalysis = useCallback(
    (map: any, result: typeof analysisResult) => {
      if (!map || !AMap) return;
      clearTargetOverlays(map);

      if (!result) {
        return;
      }

      const overlays = overlaysRef.current;

      const mainMarkers: any[] = [];
      const competitorMarkers: any[] = [];

      if (showMainPois) {
        result.samplePois.mainBrand.forEach((poi) => {
          const marker = new AMap.Marker({
            position: [poi.longitude, poi.latitude],
            title: poi.name,
            content: '<div class="marker marker-main" style="z-index:200;">M</div>',
          });
          marker.setMap(map);
          if (infoWindowRef.current) {
            marker.on("mouseover", () => {
              infoWindowRef.current.setContent(
                `<div class="poi-toast">${poi.name || "主品牌门店"}</div>`
              );
              infoWindowRef.current.open(map, marker.getPosition());
            });
            marker.on("mouseout", () => infoWindowRef.current.close());
          }
          mainMarkers.push(marker);
        });
      }

      if (showCompetitorPois) {
        result.samplePois.competitors.forEach((poi) => {
          const marker = new AMap.Marker({
            position: [poi.longitude, poi.latitude],
            title: poi.name,
            content: '<div class="marker marker-competitor" style="z-index:200;">C</div>',
          });
          marker.setMap(map);
          if (infoWindowRef.current) {
            marker.on("mouseover", () => {
              infoWindowRef.current.setContent(
                `<div class="poi-toast">${poi.name || "竞品门店"}</div>`
              );
              infoWindowRef.current.open(map, marker.getPosition());
            });
            marker.on("mouseout", () => infoWindowRef.current.close());
          }
          competitorMarkers.push(marker);
        });
      }

      overlays.mainMarkers = mainMarkers;
      overlays.competitorMarkers = competitorMarkers;

      const circle = new AMap.Circle({
        center: [result.target.lng, result.target.lat],
        radius: result.radiusMeters,
        strokeColor: "#2563eb",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillOpacity: 0.08,
        fillColor: "#2563eb",
      });
      circle.setMap(map);
      overlays.targetCircle = circle;
      map.setCenter([result.target.lng, result.target.lat]);
    },
    [AMap, clearTargetOverlays, showMainPois, showCompetitorPois]
  );

  const renderBaseMarkers = useCallback(
    (map: any, data: typeof densityResult) => {
      if (!map || !AMap) return;
      clearBaseMarkers(map);

      if (!data) {
        return;
      }

      if (!infoWindowRef.current) {
        infoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -20),
          closeWhenClickMap: true,
        });
      }

      const createCircleMarker = (
        poi: { longitude: number; latitude: number; name: string },
        color: string
      ) => {
        const marker = new AMap.CircleMarker({
          center: [poi.longitude, poi.latitude],
          radius: 5,
          strokeColor: color,
          strokeOpacity: 0.35,
          strokeWeight: 1,
          fillColor: color,
          fillOpacity: 0.85,
          zIndex: 140,
        });
        marker.setMap(map);
        if (infoWindowRef.current) {
          marker.on("mouseover", () => {
            infoWindowRef.current.setContent(
              `<div class="poi-toast">${poi.name || "门店"}</div>`
            );
            infoWindowRef.current.open(map, marker.getCenter());
          });
          marker.on("mouseout", () => infoWindowRef.current.close());
        }
        return marker;
      };

      overlaysRef.current.baseMainMarkers = showMainPois
        ? (data.mainBrandPois ?? []).map((poi) => createCircleMarker(poi, "#ef4444"))
        : [];

      overlaysRef.current.baseCompetitorMarkers = showCompetitorPois
        ? (data.competitorPois ?? []).map((poi) => createCircleMarker(poi, "#2563eb"))
        : [];
    },
    [AMap, clearBaseMarkers, showMainPois, showCompetitorPois]
  );

  const triggerAnalysis = useCallback(
    (point: { lng: number; lat: number }) => {
      if (!mainBrandInput.trim()) {
        return;
      }
      const competitorKeywords = parseKeywords(competitorInput);
      analysisMutation.mutate({
        city,
        mainBrand: mainBrandInput,
        competitorKeywords,
        radiusMeters: 1000,
        target: point,
      });
    },
    [analysisMutation, city, competitorInput, mainBrandInput]
  );

  useEffect(() => {
    if (!AMap || mapInstanceRef.current || !mapContainerRef.current) {
      return;
    }

    const center = CITY_CENTERS[city] ?? DEFAULT_CENTER;
    const map = new AMap.Map(mapContainerRef.current, {
      zoom: 12,
      center,
      viewMode: "3D",
    });

    infoWindowRef.current = new AMap.InfoWindow({
      offset: new AMap.Pixel(0, -20),
      closeWhenClickMap: true,
    });

    let disposed = false;

    map.plugin(["AMap.HeatMap"], () => {
      if (disposed) {
        return;
      }
      heatmapRef.current = new AMap.HeatMap(map, {
        radius: heatmapRadius,
        gradient: {
          0.1: "#3b82f6",
          0.3: "#22c55e",
          0.6: "#facc15",
          0.9: "#ef4444",
        },
        opacity: [Math.max(heatmapOpacity - 0.4, 0.05), heatmapOpacity],
        zIndex: 5,
      });
      if (densityResult) {
        renderHeatmap(map, densityResult);
      }
    });

    map.on("click", (event: any) => {
      const lnglat = event.lnglat;
      const point = { lng: lnglat.getLng(), lat: lnglat.getLat() };
      setTargetPoint(point);
      triggerAnalysis(point);
    });

    mapInstanceRef.current = map;

    if (densityResult) {
      renderHeatmap(map, densityResult);
      renderBaseMarkers(map, densityResult);
    }
    if (analysisResult) {
      renderTargetAnalysis(map, analysisResult);
    }

    return () => {
      disposed = true;
      if (heatmapRef.current) {
        heatmapRef.current.setMap?.(null);
        heatmapRef.current = null;
      }
      map.destroy();
      mapInstanceRef.current = null;
      infoWindowRef.current = null;
    };
  }, [AMap, city, setTargetPoint, triggerAnalysis, renderHeatmap, renderTargetAnalysis, renderBaseMarkers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const center = CITY_CENTERS[city] ?? DEFAULT_CENTER;
    map.setCenter(center);
  }, [city]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    renderHeatmap(map, densityResult);
    renderBaseMarkers(map, densityResult);
  }, [densityResult, renderHeatmap, renderBaseMarkers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    renderTargetAnalysis(map, analysisResult);
  }, [analysisResult, renderTargetAnalysis]);

  const statusText = useMemo(() => {
    if (analysisMutation.isLoading) return "正在计算目标点位";
    if (analysisMutation.isError) {
      return (analysisMutation.error as Error).message;
    }
    if (analysisResult) {
      return `密度等级：${analysisResult.densityLevel.toUpperCase()} · 数据来源 ${analysisResult.source}`;
    }
    if (densityResult) {
      return `热力图已加载 · 数据来源 ${densityResult.source}`;
    }
    return "等待用户输入";
  }, [analysisMutation.isLoading, analysisResult, densityResult]);

  return (
    <>
      <div className="map-container" ref={mapContainerRef}>
        {!AMap && <div className="map-placeholder" />}
      </div>
      <div className="map-legend">
        <div className="legend-section">
          <div className="legend-item">
            <span className="legend-swatch legend-main" /> 主品牌 POI
          </div>
          <div className="legend-item">
            <span className="legend-swatch legend-competitor" /> 竞品 POI
          </div>
        </div>
        <div className="legend-section">
          <div className="legend-gradient" />
          <span className="legend-label">热力强度（低 → 高）</span>
        </div>
      </div>
      <div className="status-bar">
        <strong>Gaode API</strong>
        <span>{error ? error.message : statusText}</span>
      </div>
    </>
  );
}
