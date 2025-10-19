import { useMemo, useCallback } from "react";

import { usePoiStore } from "../store/usePoiStore";
import { PlanningManager } from "./PlanningManager";
import { getPlanningStatusMeta } from "../data/planningOptions";

function formatDensity(level: "high" | "medium" | "low" | undefined): string {
  if (!level) return "--";
  switch (level) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return level;
  }
}

export function AnalysisSlidePanel(): JSX.Element {
  const {
    planningPoints,
    planningAnalyses,
    selectedPlanningPointId,
    analysisLoadingId,
    analysisError,
    densityResult,
    city,
    setPlanningDraft,
    setAwaitingPlanningMapClick,
    setSelectedPlanningPoint,
  } = usePoiStore();

  const selectedPlanningPoint = useMemo(
    () => planningPoints.find((item) => item.id === selectedPlanningPointId) ?? null,
    [planningPoints, selectedPlanningPointId]
  );

  const selectedAnalysis = useMemo(() => {
    if (!selectedPlanningPoint) return null;
    return planningAnalyses[selectedPlanningPoint.id] ?? null;
  }, [planningAnalyses, selectedPlanningPoint]);

  const statusMeta = useMemo(
    () => (selectedPlanningPoint ? getPlanningStatusMeta(selectedPlanningPoint.status) : null),
    [selectedPlanningPoint]
  );

  const densityDisplay = useMemo(
    () => formatDensity(selectedAnalysis?.densityLevel),
    [selectedAnalysis]
  );

  const isLoading = Boolean(
    selectedPlanningPoint && analysisLoadingId === selectedPlanningPoint.id
  );

  const lastUpdatedText = useMemo(() => {
    if (selectedAnalysis) {
      return new Date(selectedAnalysis.generatedAt * 1000).toLocaleTimeString();
    }
    if (densityResult) {
      return new Date(densityResult.generatedAt * 1000).toLocaleTimeString();
    }
    return "--";
  }, [densityResult, selectedAnalysis]);

  const analysisRadiusKm = useMemo(() => {
    if (selectedAnalysis) {
      return `${(selectedAnalysis.radiusMeters / 1000).toFixed(1)}km`;
    }
    return "3km";
  }, [selectedAnalysis]);

  const handleStartCreate = useCallback(
    (source: "search" | "map") => {
      const DEFAULT_RADIUS = 1000;
      const PLANNING_STATUS_OPTIONS = [
        { value: "pending", label: "待考察", color: "#22c55e" },
        { value: "investigating", label: "考察中", color: "#f59e0b" },
        { value: "rejected", label: "已否决", color: "#ef4444" },
        { value: "approved", label: "已通过", color: "#3b82f6" },
      ];
      const PLANNING_PRIORITY_OPTIONS = [
        { value: 100, label: "高优先级", hint: "重点考察" },
        { value: 200, label: "中优先级", hint: "常规考察" },
        { value: 300, label: "低优先级", hint: "有空再看" },
        { value: 400, label: "观察", hint: "持续关注" },
      ];
      
      const defaultStatusOption = PLANNING_STATUS_OPTIONS[0];
      const defaultPriorityOption = PLANNING_PRIORITY_OPTIONS[1] ?? PLANNING_PRIORITY_OPTIONS[0];
      const statusValue = defaultStatusOption?.value ?? "pending";
      const statusColor = defaultStatusOption?.color ?? "#22c55e";
      const priorityValue = defaultPriorityOption?.value ?? 200;

      setPlanningDraft({
        id: undefined,
        city,
        source,
        sourceType: source === "map" ? "manual" : "manual",
        name: source === "map" ? `候选点${planningPoints.length + 1}` : "",
        radiusMeters: DEFAULT_RADIUS,
        status: statusValue,
        colorToken: statusValue,
        color: statusColor,
        priorityRank: priorityValue,
        notes: "",
        center: undefined,
        sourcePoiId: null,
      });
      setAwaitingPlanningMapClick(source === "map");
      setSelectedPlanningPoint(null);
    },
    [
      city,
      planningPoints.length,
      setAwaitingPlanningMapClick,
      setPlanningDraft,
      setSelectedPlanningPoint,
    ]
  );

  return (
    <div className="slide-panel-content analysis-panel">
      <div className="slide-panel-header">
        <h2>候选点位管理</h2>
      </div>
      
      <div className="slide-panel-body">
        {/* Planning Manager */}
        <section className="panel-section">
          <div className="section-title">
            <span>📍 候选点位列表</span>
            <span className="section-count">{planningPoints.length}</span>
          </div>
          <PlanningManager />
        </section>

        {/* Selected Point Analysis */}
        {selectedPlanningPoint ? (
          <section className="panel-section">
            <div className="section-title">
              <span>📊 点位分析</span>
            </div>
            
            <div className="point-overview">
              <div className="point-header">
                <h3>{selectedPlanningPoint.name}</h3>
                <div className="point-meta">
                  <span className="point-status" style={{ color: statusMeta?.color }}>
                    {statusMeta?.label}
                  </span>
                  <span className="point-info">
                    半径 {selectedPlanningPoint.radiusMeters}m · 分析范围 {analysisRadiusKm}
                  </span>
                </div>
              </div>
              
              <div className="point-coords">
                <span>坐标：{selectedPlanningPoint.longitude.toFixed(5)} ,{" "}</span>
                <span>{selectedPlanningPoint.latitude.toFixed(5)}</span>
              </div>
            </div>

            {analysisError && (!selectedAnalysis || !isLoading) ? (
              <div className="error-message">
                {analysisError}
              </div>
            ) : null}

            {isLoading ? (
              <div className="loading-message">
                正在计算「{selectedPlanningPoint.name}」3km 范围内的品牌分布，请稍候…
              </div>
            ) : selectedAnalysis ? (
              <div className="analysis-content">
                {/* Brand Competition Overview */}
                <div className="analysis-section">
                  <h4>品牌竞争概览</h4>
                  <div className="metric-grid">
                    <div className="metric-card">
                      <h5>主品牌门店 (500m)</h5>
                      <strong>{selectedAnalysis.counts.mainBrand500m}</strong>
                      <div className="tag">圈内</div>
                    </div>
                    <div className="metric-card">
                      <h5>主品牌门店 (1000m)</h5>
                      <strong>{selectedAnalysis.counts.mainBrand1000m}</strong>
                      <div className="tag">圈内</div>
                    </div>
                    <div className="metric-card">
                      <h5>竞品门店 (100m)</h5>
                      <strong>{selectedAnalysis.counts.competitor100m}</strong>
                      <div className="tag">直接竞争</div>
                    </div>
                    <div className="metric-card">
                      <h5>竞品门店 (1000m)</h5>
                      <strong>{selectedAnalysis.counts.competitor1000m}</strong>
                      <div className="tag">商圈</div>
                    </div>
                  </div>
                </div>

                {/* Brand Density Level */}
                <div className="analysis-section">
                  <h4>品牌密度等级</h4>
                  <div className="metric-card">
                    <h5>密度等级</h5>
                    <strong>{densityDisplay}</strong>
                    <div className="tag">热力图参考</div>
                  </div>
                </div>

                {/* Sample Stores */}
                <div className="analysis-section">
                  <h4>示例门店</h4>
                  <div className="sample-stores">
                    <div className="poi-card">
                      <h4>主品牌样例</h4>
                      <p>
                        {selectedAnalysis.samplePois.mainBrand
                          .slice(0, 3)
                          .map((poi) => poi.name)
                          .join("、") || "--"}
                      </p>
                    </div>
                    <div className="poi-card">
                      <h4>竞品样例</h4>
                      <p>
                        {selectedAnalysis.samplePois.competitors
                          .slice(0, 3)
                          .map((poi) => poi.name)
                          .join("、") || "--"}
                      </p>
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 12 }}>
                  提示：当前分析结果基于 3km 范围，后续将支持自定义多半径指标。
                </p>
              </div>
            ) : (
              <div className="empty-state">
                <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                  请选择主品牌及竞品关键词，系统会自动基于 3km 范围输出竞争概览。
                </p>
              </div>
            )}
          </section>
        ) : (
          <section className="panel-section">
            <div className="section-title">
              <span>📊 点位分析</span>
            </div>
            <div className="empty-state">
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                请在上方列表中选择或新增候选点，以查看 3km 范围的目标点位分析结果。
              </p>
            </div>
          </section>
        )}

      {/* Status Info */}
        <div className="panel-footer">
          <span style={{ fontSize: 12, color: "#64748b" }}>
            数据面板更新时间：{lastUpdatedText}
          </span>
        </div>
      </div>
      
      <div className="slide-panel-footer">
        <div className="footer-actions">
          <button className="primary" type="button" onClick={() => handleStartCreate("search")}>
            关键词添加
          </button>
          <button className="primary" type="button" onClick={() => handleStartCreate("map")}>
            地图选点
          </button>
        </div>
      </div>
    </div>
  );
}