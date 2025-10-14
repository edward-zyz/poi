import { create } from "zustand";

import type { BrandDensityResponse, TargetAnalysisResponse } from "../services/api";

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
  setCity: (city) => set({ city }),
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
}));
