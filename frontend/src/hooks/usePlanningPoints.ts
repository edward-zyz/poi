import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import {
  createPlanningPoint,
  deletePlanningPoint,
  fetchPlanningPoints,
  updatePlanningPoint,
  type PlanningPoint,
  type PlanningPointPayload,
  type PlanningPointUpdatePayload,
} from "../services/api";
import { usePoiStore } from "../store/usePoiStore";

type UpdateInput = { id: string; payload: PlanningPointUpdatePayload };

const planningQueryKey = (city: string) => ["planningPoints", city] as const;

export function usePlanningPoints(): {
  points: PlanningPoint[];
  isLoading: boolean;
  refetch: () => void;
  createMutation: UseMutationResult<PlanningPoint, unknown, PlanningPointPayload, unknown>;
  updateMutation: UseMutationResult<PlanningPoint, unknown, UpdateInput, unknown>;
  deleteMutation: UseMutationResult<void, unknown, string, unknown>;
} {
  const queryClient = useQueryClient();
  const {
    city,
    planningPoints,
    setPlanningPoints,
    addPlanningPoint,
    updatePlanningPoint: updatePlanningPointInStore,
    removePlanningPoint,
  } = usePoiStore();

  const query = useQuery({
    queryKey: planningQueryKey(city),
    queryFn: () => fetchPlanningPoints(city),
    enabled: Boolean(city),
    keepPreviousData: false,
    staleTime: 60_000,
    onSuccess: (data) => {
      setPlanningPoints(data);
    },
  });

  useEffect(() => {
    if (!query.isFetching && query.isError) {
      setPlanningPoints([]);
    }
  }, [query.isError, query.isFetching, setPlanningPoints]);

  const createMutation = useMutation({
    mutationFn: createPlanningPoint,
    onSuccess: (record) => {
      addPlanningPoint(record);
      queryClient.setQueryData(planningQueryKey(record.city), (existing) => {
        if (!Array.isArray(existing)) return [record];
        const filtered = (existing as PlanningPoint[]).filter((item) => item.id !== record.id);
        return [record, ...filtered];
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: planningQueryKey(city) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: UpdateInput) => updatePlanningPoint(id, payload),
    onSuccess: (record) => {
      updatePlanningPointInStore(record);
      queryClient.setQueryData(planningQueryKey(record.city), (existing) => {
        if (!Array.isArray(existing)) return [record];
        return (existing as PlanningPoint[]).map((item) => (item.id === record.id ? record : item));
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: planningQueryKey(city) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlanningPoint(id),
    onSuccess: (_result, id) => {
      removePlanningPoint(id);
      queryClient.invalidateQueries({ queryKey: planningQueryKey(city) });
    },
  });

  return {
    points: planningPoints,
    isLoading: query.isFetching && !query.isFetched,
    refetch: () => {
      void queryClient.invalidateQueries({ queryKey: planningQueryKey(city) });
    },
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
