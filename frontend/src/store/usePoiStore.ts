import { create } from "zustand";

import type { BrandDensityResponse, TargetAnalysisResponse, PlanningPoint } from "../services/api";

export interface PlanningDraft {
  id?: string;
  city: string;
  name: string;
  radiusMeters: number;
  color: string;
  center?: { lng: number; lat: number };
  source: "search" | "map";
}

interface PoiState {
  city: string;
  mainBrandInput: string;
  competitorInput: string;
  targetPoint: { lng: number; lat: number } | null;
  densityResult: BrandDensityResponse | null;
  analysisResult: TargetAnalysisResponse | null;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  adminVisible: boolean;
  showHeatmap: boolean;
  showMainPois: boolean;
  showCompetitorPois: boolean;
  heatmapRadius: number;
  heatmapOpacity: number;
  planningPoints: PlanningPoint[];
  selectedPlanningPointId: string | null;
  planningDraft: PlanningDraft | null;
  awaitingPlanningMapClick: boolean;
  setCity: (city: string) => void;
  setMainBrandInput: (value: string) => void;
  setCompetitorInput: (value: string) => void;
  setTargetPoint: (point: { lng: number; lat: number } | null) => void;
  setDensityResult: (result: BrandDensityResponse | null) => void;
  setAnalysisResult: (result: TargetAnalysisResponse | null) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleAdmin: () => void;
  closeAdmin: () => void;
  toggleHeatmap: () => void;
  toggleMainPois: () => void;
  toggleCompetitorPois: () => void;
  setHeatmapRadius: (radius: number) => void;
  setHeatmapOpacity: (opacity: number) => void;
  setPlanningPoints: (points: PlanningPoint[]) => void;
  addPlanningPoint: (point: PlanningPoint) => void;
  updatePlanningPoint: (point: PlanningPoint) => void;
  removePlanningPoint: (id: string) => void;
  setSelectedPlanningPoint: (id: string | null) => void;
  setPlanningDraft: (draft: PlanningDraft | null) => void;
  setAwaitingPlanningMapClick: (value: boolean) => void;
}

export const usePoiStore = create<PoiState>((set) => ({
  city: "上海市",
  mainBrandInput: "喜茶",
  competitorInput: "奈雪的茶, 星巴克",
  targetPoint: null,
  densityResult: null,
  analysisResult: null,
  leftCollapsed: false,
  rightCollapsed: false,
  adminVisible: false,
  showHeatmap: true,
  showMainPois: true,
  showCompetitorPois: true,
  heatmapRadius: 40,
  heatmapOpacity: 0.8,
  planningPoints: [],
  selectedPlanningPointId: null,
  planningDraft: null,
  awaitingPlanningMapClick: false,
  setCity: (city) =>
    set({
      city,
      planningPoints: [],
      selectedPlanningPointId: null,
      planningDraft: null,
      awaitingPlanningMapClick: false,
    }),
  setMainBrandInput: (value) => set({ mainBrandInput: value }),
  setCompetitorInput: (value) => set({ competitorInput: value }),
  setTargetPoint: (point) => set({ targetPoint: point }),
  setDensityResult: (result) => set({ densityResult: result }),
  setAnalysisResult: (result) => set({ analysisResult: result }),
  toggleLeft: () => set((state) => ({ leftCollapsed: !state.leftCollapsed })),
  toggleRight: () => set((state) => ({ rightCollapsed: !state.rightCollapsed })),
  toggleAdmin: () => set((state) => ({ adminVisible: !state.adminVisible })),
  closeAdmin: () => set({ adminVisible: false }),
  toggleHeatmap: () => set((state) => ({ showHeatmap: !state.showHeatmap })),
  toggleMainPois: () => set((state) => ({ showMainPois: !state.showMainPois })),
  toggleCompetitorPois: () => set((state) => ({ showCompetitorPois: !state.showCompetitorPois })),
  setHeatmapRadius: (radius) => set({ heatmapRadius: radius }),
  setHeatmapOpacity: (opacity) => set({ heatmapOpacity: opacity }),
  setPlanningPoints: (points) => set({ planningPoints: points }),
  addPlanningPoint: (point) =>
    set((state) => ({ planningPoints: [point, ...state.planningPoints] })),
  updatePlanningPoint: (point) =>
    set((state) => ({
      planningPoints: state.planningPoints.map((item) => (item.id === point.id ? point : item)),
    })),
  removePlanningPoint: (id) =>
    set((state) => ({
      planningPoints: state.planningPoints.filter((item) => item.id !== id),
      selectedPlanningPointId: state.selectedPlanningPointId === id ? null : state.selectedPlanningPointId,
    })),
  setSelectedPlanningPoint: (id) => set({ selectedPlanningPointId: id }),
  setPlanningDraft: (draft) => set({ planningDraft: draft }),
  setAwaitingPlanningMapClick: (value) => set({ awaitingPlanningMapClick: value }),
}));
