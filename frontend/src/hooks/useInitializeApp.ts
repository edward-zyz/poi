import { useEffect } from "react";
import { usePoiStore } from "../store/usePoiStore";

export function useInitializeApp() {
  const { city, loadPlanningPoints } = usePoiStore();

  useEffect(() => {
    // 应用启动时加载默认城市的规划点位
    loadPlanningPoints(city);
  }, [city, loadPlanningPoints]);
}