import { useEffect, useState } from "react";
import type { PlanningPoint, PlanningPointPayload, PlanningPointUpdatePayload } from "../services/api";
import { usePoiStore } from "../store/usePoiStore";

type UpdateInput = { id: string; payload: PlanningPointUpdatePayload };

export function usePlanningPoints(): {
  points: PlanningPoint[];
  isLoading: boolean;
  refetch: () => Promise<void>;
  createPoint: (payload: PlanningPointPayload) => Promise<PlanningPoint>;
  updatePoint: (input: UpdateInput) => Promise<PlanningPoint>;
  deletePoint: (id: string) => Promise<void>;
} {
  const {
    city,
    planningPoints,
    loadPlanningPoints,
    addPlanningPoint,
    updatePlanningPoint,
    removePlanningPoint,
  } = usePoiStore();
  
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 初始加载数据
    setIsLoading(true);
    loadPlanningPoints(city).finally(() => setIsLoading(false));
  }, [city, loadPlanningPoints]);

  const createPoint = async (payload: PlanningPointPayload): Promise<PlanningPoint> => {
    return await addPlanningPoint({
      id: "", // 临时ID，创建后会被替换
      city: payload.city,
      name: payload.name,
      longitude: payload.center.lng,
      latitude: payload.center.lat,
      radiusMeters: payload.radiusMeters || 1000,
      color: payload.color || "#f59e0b",
      colorToken: payload.colorToken || "orange",
      status: payload.status || "pending",
      priorityRank: payload.priorityRank || 400,
      notes: payload.notes || "",
      sourceType: payload.sourceType || "manual",
      sourcePoiId: payload.sourcePoiId || null,
      updatedBy: payload.updatedBy || null,
      createdAt: Date.now() / 1000,
      updatedAt: Date.now() / 1000,
    });
  };

  const updatePoint = async (input: UpdateInput): Promise<PlanningPoint> => {
    const { id, payload } = input;
    
    // 先找到现有点位
    const existing = planningPoints.find(point => point.id === id);
    if (!existing) {
      throw new Error(`Planning point with id ${id} not found`);
    }

    const updated = {
      ...existing,
      ...payload,
      ...(payload.center ? { longitude: payload.center.lng, latitude: payload.center.lat } : {}),
      updatedAt: Date.now() / 1000,
    };

    return await updatePlanningPoint(updated);
  };

  const deletePoint = async (id: string): Promise<void> => {
    await removePlanningPoint(id);
  };

  const refetch = async (): Promise<void> => {
    setIsLoading(true);
    await loadPlanningPoints(city);
    setIsLoading(false);
  };

  return {
    points: planningPoints,
    isLoading,
    refetch,
    createPoint,
    updatePoint,
    deletePoint,
  };
}
