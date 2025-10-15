import { create } from "zustand";

import type {
  BrandDensityResponse,
  TargetAnalysisResponse,
  PlanningPoint,
} from "../services/api";
import {
  fetchPlanningPoints,
  createPlanningPoint,
  updatePlanningPoint,
  deletePlanningPoint,
} from "../services/api";

export interface PlanningDraft {
  id?: string;
  city: string;
  name: string;
  radiusMeters: number;
  color: string;
  colorToken: PlanningPoint["colorToken"];
  status: PlanningPoint["status"];
  priorityRank: number;
  notes: string;
  center?: { lng: number; lat: number };
  source: "search" | "map";
  sourceType: PlanningPoint["sourceType"];
  sourcePoiId?: string | null;
}

interface PoiState {
  city: string;
  mainBrandInput: string;
  competitorInput: string;
  densityResult: BrandDensityResponse | null;
  planningAnalyses: Record<string, TargetAnalysisResponse>;
  analysisLoadingId: string | null;
  analysisError: string | null;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  adminVisible: boolean;
  showHeatmap: boolean;
  showMainPois: boolean;
  showCompetitorPois: boolean;
  heatmapRadius: number;
  heatmapOpacity: number;
  mainBrandRadius: number;
  competitorRadius: number;
  mainBrandDisplayMode: "point" | "circle";
  competitorDisplayMode: "point" | "circle";
  planningPoints: PlanningPoint[];
  selectedPlanningPointId: string | null;
  planningDraft: PlanningDraft | null;
  awaitingPlanningMapClick: boolean;
  setCity: (city: string) => Promise<void>;
  setMainBrandInput: (value: string) => void;
  setCompetitorInput: (value: string) => void;
  setDensityResult: (result: BrandDensityResponse | null) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleAdmin: () => void;
  closeAdmin: () => void;
  toggleHeatmap: () => void;
  toggleMainPois: () => void;
  toggleCompetitorPois: () => void;
  setHeatmapRadius: (radius: number) => void;
  setHeatmapOpacity: (opacity: number) => void;
  setMainBrandRadius: (radius: number) => void;
  setCompetitorRadius: (radius: number) => void;
  setMainBrandDisplayMode: (mode: "point" | "circle") => void;
  setCompetitorDisplayMode: (mode: "point" | "circle") => void;
  loadPlanningPoints: (city?: string) => Promise<void>;
  setPlanningPoints: (points: PlanningPoint[]) => void;
  addPlanningPoint: (point: PlanningPoint) => Promise<PlanningPoint>;
  updatePlanningPoint: (point: PlanningPoint) => Promise<PlanningPoint>;
  removePlanningPoint: (id: string) => Promise<void>;
  setSelectedPlanningPoint: (id: string | null) => void;
  setPlanningDraft: (draft: PlanningDraft | null) => void;
  setAwaitingPlanningMapClick: (value: boolean) => void;
  setPlanningAnalysis: (id: string, result: TargetAnalysisResponse) => void;
  removePlanningAnalysis: (id: string) => void;
  resetPlanningAnalyses: () => void;
  setAnalysisLoading: (id: string | null) => void;
  setAnalysisError: (message: string | null) => void;
}

export const usePoiStore = create<PoiState>((set, get) => ({
  city: "上海市",
  mainBrandInput: "塔斯汀",
  competitorInput: "华莱士",
  densityResult: null,
  planningAnalyses: {},
  analysisLoadingId: null,
  analysisError: null,
  leftCollapsed: false,
  rightCollapsed: false,
  adminVisible: false,
  showHeatmap: true,
  showMainPois: true,
  showCompetitorPois: true,
  heatmapRadius: 40,
  heatmapOpacity: 0.8,
  mainBrandRadius: 500,
  competitorRadius: 100,
  mainBrandDisplayMode: "circle",
  competitorDisplayMode: "point",
  planningPoints: [],
  selectedPlanningPointId: null,
  planningDraft: null,
  awaitingPlanningMapClick: false,
  setCity: async (city) => {
    set((state) => ({
      city,
      planningDraft: null,
      awaitingPlanningMapClick: false,
      planningAnalyses: {},
      analysisLoadingId: null,
      analysisError: null,
    }));
    // 加载新城市的规划点位
    const { loadPlanningPoints } = get();
    await loadPlanningPoints(city);
  },
  setMainBrandInput: (value) => set({ mainBrandInput: value }),
  setCompetitorInput: (value) => set({ competitorInput: value }),
  setDensityResult: (result) => set({ densityResult: result }),
  toggleLeft: () => set((state) => ({ leftCollapsed: !state.leftCollapsed })),
  toggleRight: () => set((state) => ({ rightCollapsed: !state.rightCollapsed })),
  toggleAdmin: () => set((state) => ({ adminVisible: !state.adminVisible })),
  closeAdmin: () => set({ adminVisible: false }),
  toggleHeatmap: () => set((state) => ({ showHeatmap: !state.showHeatmap })),
  toggleMainPois: () => set((state) => ({ showMainPois: !state.showMainPois })),
  toggleCompetitorPois: () => set((state) => ({ showCompetitorPois: !state.showCompetitorPois })),
  setHeatmapRadius: (radius) => set({ heatmapRadius: radius }),
  setHeatmapOpacity: (opacity) => set({ heatmapOpacity: opacity }),
  setMainBrandRadius: (radius) => set({ mainBrandRadius: radius }),
  setCompetitorRadius: (radius) => set({ competitorRadius: radius }),
  setMainBrandDisplayMode: (mode) => set({ mainBrandDisplayMode: mode }),
  setCompetitorDisplayMode: (mode) => set({ competitorDisplayMode: mode }),
  // 数据库操作方法
  loadPlanningPoints: async (city) => {
    try {
      const points = await fetchPlanningPoints(city);
      set((state) => {
        const allowed = new Set(points.map((point) => point.id));
        const nextAnalyses = Object.fromEntries(
          Object.entries(state.planningAnalyses).filter(([id]) => allowed.has(id))
        );
        return {
          planningPoints: points,
          planningAnalyses: nextAnalyses,
        };
      });
    } catch (error) {
      console.error("[Store] Failed to load planning points:", error);
    }
  },
  
  setPlanningPoints: (points) =>
    set((state) => {
      const allowed = new Set(points.map((point) => point.id));
      const nextAnalyses = Object.fromEntries(
        Object.entries(state.planningAnalyses).filter(([id]) => allowed.has(id))
      );
      return {
        planningPoints: points,
        planningAnalyses: nextAnalyses,
      };
    }),
  
  addPlanningPoint: async (point) => {
    try {
      const created = await createPlanningPoint({
        city: point.city,
        name: point.name,
        radiusMeters: point.radiusMeters,
        color: point.color,
        colorToken: point.colorToken,
        status: point.status,
        priorityRank: point.priorityRank,
        notes: point.notes,
        sourceType: point.sourceType,
        sourcePoiId: point.sourcePoiId,
        updatedBy: point.updatedBy,
        center: { lng: point.longitude, lat: point.latitude },
      });
      set((state) => ({ planningPoints: [created, ...state.planningPoints] }));
      return created;
    } catch (error) {
      console.error("[Store] Failed to create planning point:", error);
      throw error;
    }
  },
  
  updatePlanningPoint: async (point) => {
    try {
      const updated = await updatePlanningPoint(point.id, {
        city: point.city,
        name: point.name,
        radiusMeters: point.radiusMeters,
        color: point.color,
        colorToken: point.colorToken,
        status: point.status,
        priorityRank: point.priorityRank,
        notes: point.notes,
        sourceType: point.sourceType,
        sourcePoiId: point.sourcePoiId,
        updatedBy: point.updatedBy,
        center: { lng: point.longitude, lat: point.latitude },
      });
      set((state) => ({
        planningPoints: state.planningPoints.map((item) => (item.id === updated.id ? updated : item)),
      }));
      return updated;
    } catch (error) {
      console.error("[Store] Failed to update planning point:", error);
      throw error;
    }
  },
  
  removePlanningPoint: async (id) => {
    try {
      await deletePlanningPoint(id);
      set((state) => ({
        planningPoints: state.planningPoints.filter((item) => item.id !== id),
        selectedPlanningPointId: state.selectedPlanningPointId === id ? null : state.selectedPlanningPointId,
        planningAnalyses: Object.fromEntries(
          Object.entries(state.planningAnalyses).filter(([key]) => key !== id)
        ),
      }));
    } catch (error) {
      console.error("[Store] Failed to delete planning point:", error);
      throw error;
    }
  },
  setSelectedPlanningPoint: (id) => set({ selectedPlanningPointId: id }),
  setPlanningDraft: (draft) => set({ planningDraft: draft }),
  setAwaitingPlanningMapClick: (value) => set({ awaitingPlanningMapClick: value }),
  setPlanningAnalysis: (id, result) =>
    set((state) => ({
      planningAnalyses: {
        ...state.planningAnalyses,
        [id]: result,
      },
      analysisLoadingId: state.analysisLoadingId === id ? null : state.analysisLoadingId,
      analysisError: state.analysisLoadingId === id ? null : state.analysisError,
    })),
  removePlanningAnalysis: (id) =>
    set((state) => ({
      planningAnalyses: Object.fromEntries(
        Object.entries(state.planningAnalyses).filter(([key]) => key !== id)
      ),
    })),
  resetPlanningAnalyses: () =>
    set({
      planningAnalyses: {},
      analysisLoadingId: null,
      analysisError: null,
    }),
  setAnalysisLoading: (id) => set({ analysisLoadingId: id }),
  setAnalysisError: (message) => set({ analysisError: message }),
}));
