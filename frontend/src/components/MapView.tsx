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
const DEFAULT_ANALYSIS_RADIUS = 1000;

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
    planningCircles: [] as any[],
  });
  const infoWindowRef = useRef<any>(null);
  const heatmapRef = useRef<any>(null);
  const analysisDebounceRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const lastCenteredPlanningRef = useRef<{
    key: string;
    lng: number;
    lat: number;
  } | null>(null);
  const lastAnalysisSignatureRef = useRef<string | null>(null);
  const renderHeatmapRef = useRef<typeof renderHeatmap>();
  const renderTargetAnalysisRef = useRef<typeof renderTargetAnalysis>();
  const renderBaseMarkersRef = useRef<typeof renderBaseMarkers>();
  const renderPlanningPointsRef = useRef<typeof renderPlanningPoints>();
  const runAnalysisRef = useRef<typeof runAnalysis>();

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
    planningPoints,
    selectedPlanningPointId,
    setSelectedPlanningPoint,
    planningDraft,
    setPlanningDraft,
    awaitingPlanningMapClick,
    setAwaitingPlanningMapClick,
  } = usePoiStore();

  const analysisMutation = useMutation({
    mutationFn: fetchTargetAnalysis,
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

      const overlays = overlaysRef.current;

      const disposeMarkers = (markers: any[]) => {
        markers.forEach((marker) => marker.setMap?.(null));
      };

      if (!result) {
        disposeMarkers(overlays.mainMarkers);
        disposeMarkers(overlays.competitorMarkers);
        overlays.mainMarkers = [];
        overlays.competitorMarkers = [];
        if (overlays.targetCircle) {
          overlays.targetCircle.setMap?.(null);
          overlays.targetCircle = null;
        }
        return;
      }

      const ensureInfoHandlers = (marker: any, fallback: string) => {
        if (!infoWindowRef.current || marker.__hasInfoHandler) {
          return;
        }
        marker.on("mouseover", () => {
          const ext = marker.getExtData?.() ?? {};
          const name = ext.name || fallback;
          infoWindowRef.current.setContent(`<div class="poi-toast">${name}</div>`);
          infoWindowRef.current.open(map, marker.getPosition());
        });
        marker.on("mouseout", () => infoWindowRef.current.close());
        marker.__hasInfoHandler = true;
      };

      const syncMarkers = (
        existing: any[],
        pois: Array<{ longitude: number; latitude: number; name: string }>,
        options: { content: string; fallback: string }
      ) => {
        const next: any[] = [];
        for (let index = 0; index < pois.length; index += 1) {
          const poi = pois[index];
          let marker = existing[index];
          if (!marker) {
            marker = new AMap.Marker({
              position: [poi.longitude, poi.latitude],
              title: poi.name,
              content: options.content,
            });
            marker.setMap(map);
          } else {
            marker.setPosition?.([poi.longitude, poi.latitude]);
            marker.setTitle?.(poi.name);
            marker.setContent?.(options.content);
            marker.setMap(map);
          }
          marker.setExtData?.({ name: poi.name || options.fallback });
          ensureInfoHandlers(marker, options.fallback);
          next.push(marker);
        }
        for (let index = pois.length; index < existing.length; index += 1) {
          const marker = existing[index];
          marker.setMap?.(null);
        }
        return next;
      };

      if (showMainPois) {
        overlays.mainMarkers = syncMarkers(
          overlays.mainMarkers,
          result.samplePois.mainBrand,
          {
            content: '<div class="marker marker-main" style="z-index:200;">M</div>',
            fallback: "主品牌门店",
          }
        );
      } else {
        disposeMarkers(overlays.mainMarkers);
        overlays.mainMarkers = [];
      }

      if (showCompetitorPois) {
        overlays.competitorMarkers = syncMarkers(
          overlays.competitorMarkers,
          result.samplePois.competitors,
          {
            content: '<div class="marker marker-competitor" style="z-index:200;">C</div>',
            fallback: "竞品门店",
          }
        );
      } else {
        disposeMarkers(overlays.competitorMarkers);
        overlays.competitorMarkers = [];
      }

      if (!overlays.targetCircle) {
        overlays.targetCircle = new AMap.Circle({
          center: [result.target.lng, result.target.lat],
          radius: result.radiusMeters,
          strokeColor: "#2563eb",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillOpacity: 0.08,
          fillColor: "#2563eb",
        });
        overlays.targetCircle.setMap(map);
      } else {
        overlays.targetCircle.setCenter?.([result.target.lng, result.target.lat]);
        overlays.targetCircle.setRadius?.(result.radiusMeters);
        overlays.targetCircle.setOptions?.({
          strokeColor: "#2563eb",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillOpacity: 0.08,
          fillColor: "#2563eb",
        });
        overlays.targetCircle.setMap?.(map);
      }
    },
    [AMap, showMainPois, showCompetitorPois]
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

  const renderPlanningPoints = useCallback(
    (map: any, points: typeof planningPoints, selectedId: string | null) => {
      if (!map || !AMap) return;
      const overlays = overlaysRef.current;
      if (overlays.planningCircles.length) {
        map.remove(overlays.planningCircles);
        overlays.planningCircles = [];
      }
      if (!points || points.length === 0) {
        return;
      }
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }

      const circles = points.map((point) => {
        const center: [number, number] = [point.longitude, point.latitude];
        const isSelected = point.id === selectedId;
        const circle = new AMap.Circle({
          center,
          radius: point.radiusMeters,
          strokeColor: point.color,
          strokeWeight: isSelected ? 3 : 2,
          strokeOpacity: isSelected ? 0.95 : 0.75,
          fillOpacity: isSelected ? 0.28 : 0.16,
          fillColor: point.color,
          zIndex: isSelected ? 220 : 160,
        });
        circle.setMap(map);
        circle.on("click", (event: any) => {
          event?.stopPropagation?.();
          setSelectedPlanningPoint(point.id);
        });
        if (infoWindowRef.current) {
          circle.on("mouseover", () => {
            infoWindowRef.current.setContent(
              `<div class="poi-toast">${point.name || "规划点"} · ${point.radiusMeters}m</div>`
            );
            infoWindowRef.current.open(map, center);
          });
          circle.on("mouseout", () => infoWindowRef.current.close());
        }

        return circle;
      });

      overlays.planningCircles = circles;
    },
    [AMap, setSelectedPlanningPoint]
  );

  useEffect(() => {
    renderHeatmapRef.current = renderHeatmap;
  }, [renderHeatmap]);

  useEffect(() => {
    renderTargetAnalysisRef.current = renderTargetAnalysis;
  }, [renderTargetAnalysis]);

  useEffect(() => {
    renderBaseMarkersRef.current = renderBaseMarkers;
  }, [renderBaseMarkers]);

  useEffect(() => {
    renderPlanningPointsRef.current = renderPlanningPoints;
  }, [renderPlanningPoints]);

  const gatherAnalysisParams = useCallback(
    (point: { lng: number; lat: number }, radiusMeters: number, key: string) => {
      const mainBrand = mainBrandInput.trim();
      if (!mainBrand) {
        return null;
      }
      const competitorKeywords = parseKeywords(competitorInput);
      return {
        payload: {
          city,
          mainBrand,
          competitorKeywords,
          radiusMeters,
          target: point,
        },
        signature: buildAnalysisSignature({
          city,
          pointKey: key,
          lng: point.lng,
          lat: point.lat,
          radiusMeters,
          mainBrand,
          competitorKeywords,
        }),
      };
    },
    [city, competitorInput, mainBrandInput]
  );

  const centerMapOnPoint = useCallback((point: { lng: number; lat: number }, key: string) => {
    const last = lastCenteredPlanningRef.current;
    if (last && last.key === key && last.lng === point.lng && last.lat === point.lat) {
      return;
    }
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setCenter([point.lng, point.lat]);
    lastCenteredPlanningRef.current = { key, lng: point.lng, lat: point.lat };
  }, []);

  const handleAnalysisSuccess = useCallback(
    (key: string, expectedSignature: string, result: Awaited<ReturnType<typeof fetchTargetAnalysis>>) => {
      const responseSignature = buildAnalysisSignature({
        city: result.city,
        pointKey: key,
        lng: result.target.lng,
        lat: result.target.lat,
        radiusMeters: result.radiusMeters,
        mainBrand: result.mainBrandLabel || result.mainBrand,
        competitorKeywords: result.competitorKeywords ?? [],
      });
      if (
        responseSignature !== expectedSignature ||
        lastAnalysisSignatureRef.current !== expectedSignature
      ) {
        return;
      }
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
    [setAnalysisResult]
  );

  const runAnalysis = useCallback(
    (
      point: { lng: number; lat: number },
      radiusMeters: number,
      key: string,
      options?: { center?: boolean }
    ): boolean => {
      const gathered = gatherAnalysisParams(point, radiusMeters, key);
      if (!gathered) {
        return false;
      }
      lastAnalysisSignatureRef.current = gathered.signature;
      if (options?.center) {
        centerMapOnPoint(point, key);
      }
      setTargetPoint(point);
      analysisMutation.mutate(gathered.payload, {
        onSuccess: (result) => handleAnalysisSuccess(key, gathered.signature, result),
      });
      return true;
    },
    [analysisMutation, centerMapOnPoint, gatherAnalysisParams, handleAnalysisSuccess, setTargetPoint]
  );

  useEffect(() => {
    runAnalysisRef.current = runAnalysis;
  }, [runAnalysis]);

  useEffect(() => {
    if (!AMap || mapInstanceRef.current || !mapContainerRef.current) {
      return;
    }

    const state = usePoiStore.getState();
    const initialCity = state.city;
    const initialDensity = state.densityResult;
    const initialAnalysis = state.analysisResult;
    const initialPlanningPoints = state.planningPoints;
    const initialSelectedPlanning = state.selectedPlanningPointId;
    const initialHeatmapRadius = state.heatmapRadius;
    const initialHeatmapOpacity = state.heatmapOpacity;

    const center = CITY_CENTERS[initialCity] ?? DEFAULT_CENTER;
    const map = new AMap.Map(mapContainerRef.current, {
      zoom: 12,
      center,
      viewMode: "3D",
    });

    infoWindowRef.current = new AMap.InfoWindow({
      offset: new AMap.Pixel(0, -20),
      closeWhenClickMap: true,
    });

    map.plugin(["AMap.HeatMap"], () => {
      heatmapRef.current = new AMap.HeatMap(map, {
        radius: initialHeatmapRadius,
        gradient: {
          0.1: "#3b82f6",
          0.3: "#22c55e",
          0.6: "#facc15",
          0.9: "#ef4444",
        },
        opacity: [
          Math.max(initialHeatmapOpacity - 0.4, 0.05),
          initialHeatmapOpacity,
        ],
        zIndex: 5,
      });
      if (initialDensity && renderHeatmapRef.current) {
        renderHeatmapRef.current(map, initialDensity);
      }
    });

    map.on("click", (event: any) => {
      const lnglat = event.lnglat;
      const point = { lng: lnglat.getLng(), lat: lnglat.getLat() };
      const latestState = usePoiStore.getState();
      if (latestState.awaitingPlanningMapClick && latestState.planningDraft) {
        latestState.setPlanningDraft({
          ...latestState.planningDraft,
          center: point,
        });
        latestState.setAwaitingPlanningMapClick(false);
        latestState.setSelectedPlanningPoint(null);
        return;
      }
      const executed = runAnalysisRef.current
        ? runAnalysisRef.current(point, DEFAULT_ANALYSIS_RADIUS, "map-click")
        : false;
      if (!executed) {
        latestState.setTargetPoint(point);
      }
    });

    mapInstanceRef.current = map;

    if (initialDensity && renderBaseMarkersRef.current) {
      renderBaseMarkersRef.current(map, initialDensity);
    }
    if (initialAnalysis && renderTargetAnalysisRef.current) {
      renderTargetAnalysisRef.current(map, initialAnalysis);
    }
    if (renderPlanningPointsRef.current) {
      renderPlanningPointsRef.current(map, initialPlanningPoints, initialSelectedPlanning);
    }

    return () => {
      if (heatmapRef.current) {
        heatmapRef.current.setMap?.(null);
        heatmapRef.current = null;
      }
      map.destroy();
      mapInstanceRef.current = null;
      infoWindowRef.current = null;
    };
  }, [AMap]);

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

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    renderPlanningPoints(map, planningPoints, selectedPlanningPointId);
  }, [planningPoints, selectedPlanningPointId, renderPlanningPoints]);

  const selectedPlanningPoint = useMemo(
    () => planningPoints.find((item) => item.id === selectedPlanningPointId) ?? null,
    [planningPoints, selectedPlanningPointId]
  );

  useEffect(() => {
    if (!selectedPlanningPoint) {
      lastAnalysisSignatureRef.current = null;
      if (analysisDebounceRef.current) {
        window.clearTimeout(analysisDebounceRef.current);
        analysisDebounceRef.current = null;
      }
      return;
    }

    const point = {
      lng: selectedPlanningPoint.longitude,
      lat: selectedPlanningPoint.latitude,
    };
    const key = selectedPlanningPoint.id;
    const gathered = gatherAnalysisParams(point, selectedPlanningPoint.radiusMeters, key);
    if (!gathered) {
      return;
    }

    if (lastAnalysisSignatureRef.current === gathered.signature) {
      return;
    }

    if (analysisDebounceRef.current) {
      window.clearTimeout(analysisDebounceRef.current);
    }

    analysisDebounceRef.current = window.setTimeout(() => {
      const lastCentered = lastCenteredPlanningRef.current;
      const shouldCenter =
        !lastCentered ||
        lastCentered.key !== key ||
        lastCentered.lng !== point.lng ||
        lastCentered.lat !== point.lat;
      runAnalysis(point, selectedPlanningPoint.radiusMeters, key, { center: shouldCenter });
      analysisDebounceRef.current = null;
    }, 400);

    return () => {
      if (analysisDebounceRef.current) {
        window.clearTimeout(analysisDebounceRef.current);
        analysisDebounceRef.current = null;
      }
    };
  }, [selectedPlanningPoint, gatherAnalysisParams, runAnalysis]);

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

function buildAnalysisSignature(params: {
  city: string;
  pointKey: string;
  lng: number;
  lat: number;
  radiusMeters: number;
  mainBrand: string;
  competitorKeywords: string[];
}): string {
  const normalizedMainBrand = params.mainBrand.trim().toLowerCase();
  const normalizedCompetitors = params.competitorKeywords
    .map((keyword) => keyword.trim().toLowerCase())
    .join("|");
  return [
    params.city,
    params.pointKey,
    params.lng.toFixed(6),
    params.lat.toFixed(6),
    params.radiusMeters,
    normalizedMainBrand,
    normalizedCompetitors,
  ].join("|");
}
