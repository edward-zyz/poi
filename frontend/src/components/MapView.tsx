import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { fetchTargetAnalysis, type PlanningPoint, type TargetAnalysisResponse } from "../services/api";
import { usePoiStore } from "../store/usePoiStore";
import { parseKeywords } from "../utils/keywords";
import { useAmapLoader } from "../hooks/useAmapLoader";
import { getPlanningStatusMeta } from "../data/planningOptions";
import { useIsMobile } from "../hooks/useIsMobile";
import type { PoiSummary } from "../services/api";

const CITY_CENTERS: Record<string, [number, number]> = {
  上海市: [121.4737, 31.2304],
  北京市: [116.4074, 39.9042],
  广州市: [113.2644, 23.1291],
  深圳市: [114.0596, 22.5431],
  杭州市: [120.1536, 30.2875],
  成都市: [104.0668, 30.5728],
};

const DEFAULT_CENTER: [number, number] = [116.4074, 39.9042];
interface MapViewProps {
  onPOIClick?: (poi: PoiSummary | PlanningPoint, position: { lng: number; lat: number }) => void;
  onMapLongPress?: (position: { lng: number; lat: number }) => void;
}

export function MapView({ onPOIClick, onMapLongPress }: MapViewProps): JSX.Element {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef({
    heatmap: [] as any[],
    mainMarkers: [] as any[],
    competitorMarkers: [] as any[],
    targetCircle: null as any,
    baseMainMarkers: [] as any[],
    baseCompetitorMarkers: [] as any[],
    baseMainCircles: [] as any[],
    baseCompetitorCircles: [] as any[],
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
  const lastAnalysisKeyRef = useRef<string | null>(null);
  const renderHeatmapRef = useRef<typeof renderHeatmap>();
  const renderTargetAnalysisRef = useRef<typeof renderTargetAnalysis>();
  const renderBaseMarkersRef = useRef<typeof renderBaseMarkers>();
  const renderPlanningPointsRef = useRef<typeof renderPlanningPoints>();

  const { AMap, error } = useAmapLoader();
  const isMobile = useIsMobile();
  const {
    city,
    competitorInput,
    mainBrandInput,
    densityResult,
    planningAnalyses,
    analysisLoadingId,
    analysisError,
    setPlanningAnalysis,
    setAnalysisLoading,
    setAnalysisError,
    showHeatmap,
    showMainPois,
    showCompetitorPois,
    heatmapRadius,
    heatmapOpacity,
    mainBrandRadius,
    competitorRadius,
    mainBrandDisplayMode,
    competitorDisplayMode,
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
    if (overlays.baseMainCircles.length) {
      map.remove(overlays.baseMainCircles);
      overlays.baseMainCircles = [];
    }
    if (overlays.baseCompetitorCircles.length) {
      map.remove(overlays.baseCompetitorCircles);
      overlays.baseCompetitorCircles = [];
    }
  }, []);

  const renderTargetAnalysis = useCallback(
    (map: any, result: TargetAnalysisResponse | null) => {
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

      // 移除主品牌与竞品的 M/C 标签标记，仅保留圈层效果
      disposeMarkers(overlays.mainMarkers);
      overlays.mainMarkers = [];
      disposeMarkers(overlays.competitorMarkers);
      overlays.competitorMarkers = [];

      if (!overlays.targetCircle && AMap && AMap.Circle) {
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
    [AMap]
  );

  const createRadiusCircle = useCallback((
    map: any,
    poi: any,
    radius: number,
    color: string
  ) => {
    if (!AMap || !AMap.Circle) {
      return null;
    }
    
    const circle = new AMap.Circle({
      center: [poi.longitude, poi.latitude],
      radius: radius,
      strokeColor: color,
      strokeOpacity: 0.6,
      strokeWeight: 1,
      fillOpacity: 0.15,
      fillColor: color,
      zIndex: 120,
    });
    circle.setMap(map);
    
    if (infoWindowRef.current) {
      circle.on("mouseover", () => {
        infoWindowRef.current.setContent(
          `<div class="poi-toast">${poi.name || "门店"} · 半径${radius}m</div>`
        );
        infoWindowRef.current.open(map, circle.getCenter());
      });
      circle.on("mouseout", () => infoWindowRef.current.close());
    }
    
    return circle;
  }, [AMap]);

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
          isCustom: true,
        });
      }

      const createCircleMarker = (
        poi: { longitude: number; latitude: number; name: string },
        color: string
      ) => {
        if (!AMap || !AMap.CircleMarker) {
          return null;
        }
        
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

      // For main brand POIs - show all POIs but with different styles
      if (showMainPois) {
        const mainPois = data.mainBrandPois ?? [];

        // Always show all POIs as points
        overlaysRef.current.baseMainMarkers = mainPois
          .map((poi) => createCircleMarker(poi, "#ef4444"))
          .filter((marker): marker is any => marker !== null);
        
        // Create radius circles for main brand if in circle mode (for visual effect only)
        if (mainBrandDisplayMode === "circle") {
          overlaysRef.current.baseMainCircles = mainPois
            .map((poi) => createRadiusCircle(map, poi, mainBrandRadius, "#ef4444"))
            .filter((circle): circle is any => circle !== null);
        }
      }

      // For competitor POIs - show all POIs but with different styles  
      if (showCompetitorPois) {
        const competitorPois = data.competitorPois ?? [];

        // Always show all POIs as points
        overlaysRef.current.baseCompetitorMarkers = competitorPois
          .map((poi) => createCircleMarker(poi, "#2563eb"))
          .filter((marker): marker is any => marker !== null);
        
        // Create radius circles for competitors if in circle mode (for visual effect only)
        if (competitorDisplayMode === "circle") {
          overlaysRef.current.baseCompetitorCircles = competitorPois
            .map((poi) => createRadiusCircle(map, poi, competitorRadius, "#2563eb"))
            .filter((circle): circle is any => circle !== null);
        }
      }
    },
    [AMap, clearBaseMarkers, showMainPois, showCompetitorPois, mainBrandRadius, competitorRadius, mainBrandDisplayMode, competitorDisplayMode, createRadiusCircle]
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
        const statusMeta = getPlanningStatusMeta(point.status);
        
        if (!AMap || !AMap.Circle) {
          return null;
        }
        
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
              `<div class="poi-toast">${point.name || "规划点"} · ${statusMeta.label} · ${
                point.radiusMeters
              }m</div>`
            );
            infoWindowRef.current.open(map, center);
          });
          circle.on("mouseout", () => infoWindowRef.current.close());
        }

        return circle;
      });

      overlays.planningCircles = circles.filter((circle): circle is any => circle !== null);
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
    (point: PlanningPoint) => {
      const mainBrand = mainBrandInput.trim();
      if (!mainBrand) {
        return null;
      }
      const competitorKeywords = parseKeywords(competitorInput);
      const radiusMeters = Math.max(point.radiusMeters ?? 0, 3000);
      const target = {
        lng: point.longitude,
        lat: point.latitude,
      };

      return {
        payload: {
          city,
          mainBrand,
          competitorKeywords,
          radiusMeters,
          target,
        },
        signature: buildAnalysisSignature({
          city,
          pointKey: point.id,
          lng: target.lng,
          lat: target.lat,
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
    (key: string, expectedSignature: string, result: TargetAnalysisResponse) => {
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
      setPlanningAnalysis(key, result);
      if (lastAnalysisKeyRef.current === key) {
        setAnalysisLoading(null);
        setAnalysisError(null);
      }
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
    [setPlanningAnalysis, setAnalysisError, setAnalysisLoading]
  );

  const runPlanningAnalysis = useCallback(
    (point: PlanningPoint, options?: { center?: boolean }): boolean => {
      const gathered = gatherAnalysisParams(point);
      if (!gathered) {
        if (!mainBrandInput.trim()) {
          setAnalysisError("请先填写主品牌后再生成分析");
        }
        return false;
      }
      const centerPoint = { lng: point.longitude, lat: point.latitude };
      lastAnalysisSignatureRef.current = gathered.signature;
      lastAnalysisKeyRef.current = point.id;
      if (options?.center) {
        centerMapOnPoint(centerPoint, point.id);
      }
      setAnalysisLoading(point.id);
      setAnalysisError(null);
      analysisMutation.mutate(gathered.payload, {
        onSuccess: (result) => handleAnalysisSuccess(point.id, gathered.signature, result),
        onError: (mutationError) => {
          if (lastAnalysisKeyRef.current === point.id) {
            setAnalysisError((mutationError as Error).message ?? "分析失败，请稍后重试");
            setAnalysisLoading(null);
          }
        },
      });
      return true;
    },
    [
      analysisMutation,
      centerMapOnPoint,
      gatherAnalysisParams,
      handleAnalysisSuccess,
      mainBrandInput,
      setAnalysisError,
      setAnalysisLoading,
    ]
  );

  useEffect(() => {
    if (!AMap || mapInstanceRef.current || !mapContainerRef.current) {
      return;
    }

    const state = usePoiStore.getState();
    const initialCity = state.city;
    const initialDensity = state.densityResult;
    const initialPlanningPoints = state.planningPoints;
    const initialSelectedPlanning = state.selectedPlanningPointId;
    const initialAnalysis =
      initialSelectedPlanning && state.planningAnalyses
        ? state.planningAnalyses[initialSelectedPlanning] ?? null
        : null;
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
      isCustom: true,
    });

    map.plugin(["AMap.HeatMap", "AMap.Circle", "AMap.CircleMarker"], () => {
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
          sourceType: "manual",
          sourcePoiId: null,
        });
        latestState.setAwaitingPlanningMapClick(false);
        latestState.setSelectedPlanningPoint(null);
        return;
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

  // Mobile touch interactions
  useEffect(() => {
    if (!isMobile || !mapInstanceRef.current) return;
    
    const setupMobileInteractions = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      
      let longPressTimer: any = null;
      let touchStartTime = 0;
      const LONG_PRESS_DURATION = 500; // 500ms for long press
      
      const handleTouchStart = (event: any) => {
        touchStartTime = Date.now();
        
        // Clear any existing timer
        if (longPressTimer) {
          clearTimeout(longPressTimer);
        }
        
        // Set new timer for long press
        longPressTimer = setTimeout(() => {
          if (onMapLongPress && event.lnglat) {
            const point = { lng: event.lnglat.getLng(), lat: event.lnglat.getLat() };
            onMapLongPress(point);
          }
        }, LONG_PRESS_DURATION);
      };
      
      const handleTouchEnd = (event: any) => {
        const touchDuration = Date.now() - touchStartTime;
        
        // Clear long press timer
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        
        // If it was a short tap, handle as click
        if (touchDuration < LONG_PRESS_DURATION && onPOIClick) {
          // Check if there's a POI at the clicked position
          const lnglat = event.lnglat;
          if (lnglat) {
            const point = { lng: lnglat.getLng(), lat: lnglat.getLat() };
            
            // Find nearby POIs (within a small radius for mobile touch)
            const touchRadius = 50; // 50 meters
            const nearbyMainPois = densityResult?.mainBrandPois?.filter(poi => {
              const distance = calculateDistance(point.lat, point.lng, poi.latitude, poi.longitude);
              return distance <= touchRadius;
            }) || [];
            
            const nearbyCompetitorPois = densityResult?.competitorPois?.filter(poi => {
              const distance = calculateDistance(point.lat, point.lng, poi.latitude, poi.longitude);
              return distance <= touchRadius;
            }) || [];
            
            const allNearbyPois = [...nearbyMainPois, ...nearbyCompetitorPois];
            
            if (allNearbyPois.length > 0) {
              // Take the closest POI
              const closestPoi = allNearbyPois.reduce((closest, poi) => {
                const closestDist = calculateDistance(point.lat, point.lng, closest.latitude, closest.longitude);
                const poiDist = calculateDistance(point.lat, point.lng, poi.latitude, poi.longitude);
                return poiDist < closestDist ? poi : closest;
              });
              
              onPOIClick(closestPoi, point);
            }
          }
        }
      };
      
      const handleTouchMove = () => {
        // Clear long press timer if user moves finger
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };
      
      // Add mobile touch event listeners
      map.on('touchstart', handleTouchStart);
      map.on('touchend', handleTouchEnd);
      map.on('touchmove', handleTouchMove);
      
      // Store cleanup function
      return () => {
        map.off('touchstart', handleTouchStart);
        map.off('touchend', handleTouchEnd);
        map.off('touchmove', handleTouchMove);
        if (longPressTimer) {
          clearTimeout(longPressTimer);
        }
      };
    };
    
    const cleanup = setupMobileInteractions();
    return cleanup;
  }, [isMobile, densityResult]);
  
  // Helper function to calculate distance between two points
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
  };

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
    renderPlanningPoints(map, planningPoints, selectedPlanningPointId);
  }, [planningPoints, selectedPlanningPointId, renderPlanningPoints]);

  const selectedPlanningPoint = useMemo(
    () => planningPoints.find((item) => item.id === selectedPlanningPointId) ?? null,
    [planningPoints, selectedPlanningPointId]
  );

  const selectedAnalysis = useMemo(() => {
    if (!selectedPlanningPoint) return null;
    return planningAnalyses[selectedPlanningPoint.id] ?? null;
  }, [planningAnalyses, selectedPlanningPoint]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    renderTargetAnalysis(map, selectedAnalysis);
  }, [selectedAnalysis, renderTargetAnalysis]);

  useEffect(() => {
    if (!selectedPlanningPoint) {
      lastAnalysisSignatureRef.current = null;
      lastAnalysisKeyRef.current = null;
      if (analysisDebounceRef.current) {
        window.clearTimeout(analysisDebounceRef.current);
        analysisDebounceRef.current = null;
      }
      return;
    }

    const key = selectedPlanningPoint.id;
    const point = {
      lng: selectedPlanningPoint.longitude,
      lat: selectedPlanningPoint.latitude,
    };
    const existing = planningAnalyses[key];
    const hasUpToDateAnalysis =
      existing &&
      existing.city === selectedPlanningPoint.city &&
      Math.abs(existing.target.lng - point.lng) < 1e-6 &&
      Math.abs(existing.target.lat - point.lat) < 1e-6 &&
      existing.generatedAt >= selectedPlanningPoint.updatedAt;

    const gathered = gatherAnalysisParams(selectedPlanningPoint);

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

      if (!hasUpToDateAnalysis && gathered) {
        const alreadyQueued =
          lastAnalysisSignatureRef.current === gathered.signature &&
          lastAnalysisKeyRef.current === key &&
          analysisLoadingId === key;
        if (!alreadyQueued) {
          const executed = runPlanningAnalysis(selectedPlanningPoint, { center: shouldCenter });
          if (!executed && shouldCenter) {
            centerMapOnPoint(point, key);
          }
        }
      } else if (shouldCenter) {
        centerMapOnPoint(point, key);
      }
      analysisDebounceRef.current = null;
    }, 400);

    return () => {
      if (analysisDebounceRef.current) {
        window.clearTimeout(analysisDebounceRef.current);
        analysisDebounceRef.current = null;
      }
    };
  }, [
    selectedPlanningPoint,
    planningAnalyses,
    analysisLoadingId,
    gatherAnalysisParams,
    runPlanningAnalysis,
    centerMapOnPoint,
  ]);

  const statusText = useMemo(() => {
    if (analysisLoadingId) {
      return "正在计算候选点分析";
    }
    if (analysisError) {
      return analysisError;
    }
    if (selectedAnalysis) {
      return `密度等级：${selectedAnalysis.densityLevel.toUpperCase()} · 数据来源 ${selectedAnalysis.source}`;
    }
    if (densityResult) {
      return `热力图已加载 · 数据来源 ${densityResult.source}`;
    }
    if (selectedPlanningPoint) {
      return "候选点准备就绪，等待分析条件";
    }
    return "请选择或新增候选点";
  }, [analysisLoadingId, analysisError, selectedAnalysis, densityResult, selectedPlanningPoint]);

  return (
    <>
      <div className="map-container" ref={mapContainerRef}>
        {!AMap && <div className="map-placeholder" />}
      </div>
      {isMobile ? (
        // 移动端简化图例 - 只显示主品牌和竞品POI，放在底部
        <div className="map-legend mobile-legend">
          <div className="legend-section">
            <div className="legend-items-row">
              <div className="legend-item">
                <span className="legend-swatch legend-main" /> 主品牌
              </div>
              <div className="legend-item">
                <span className="legend-swatch legend-competitor" /> 竞品
              </div>
            </div>
          </div>
        </div>
      ) : (
        // 桌面端完整图例
        <div className="map-legend">
          <div className="legend-section">
            <div className="legend-items-row">
              <div className="legend-item">
                <span className="legend-swatch legend-main" /> 主品牌 POI
              </div>
              <div className="legend-item">
                <span className="legend-swatch legend-competitor" /> 竞品 POI
              </div>
            </div>
          </div>
          <div className="legend-section">
            <div className="legend-items-row">
              <div className="legend-item">
                <span className="legend-swatch" style={{ backgroundColor: "#f59e0b" }} /> 待考察
              </div>
              <div className="legend-item">
                <span className="legend-swatch" style={{ backgroundColor: "#8b5cf6" }} /> 重点跟进
              </div>
              <div className="legend-item">
                <span className="legend-swatch" style={{ backgroundColor: "#94a3b8" }} /> 淘汰
              </div>
            </div>
          </div>
          <div className="legend-section">
            <div className="legend-gradient" />
            <span className="legend-label">热力强度（低 → 高）</span>
          </div>
        </div>
      )}
      {/* Status Bar - 隐藏移动端显示 */}
      {!isMobile && (
        <div className="status-bar">
          <strong>Gaode API</strong>
          <span>{error ? error.message : statusText}</span>
        </div>
      )}
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
