import { useMemo } from "react";

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

export function RightPanel(): JSX.Element {
  const {
    rightCollapsed,
    toggleRight,
    planningPoints,
    planningAnalyses,
    selectedPlanningPointId,
    analysisLoadingId,
    analysisError,
    densityResult,
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

  const handleHeaderClick = () => {
    toggleRight();
  };

  return (
    <aside className={`panel panel-top right ${rightCollapsed ? "collapsed" : ""}`}>
      <div className="panel-header" onClick={handleHeaderClick}>
        <h2>候选点规划与分析</h2>
        <button type="button" onClick={(e) => { e.stopPropagation(); toggleRight(); }}>
          {rightCollapsed ? "▼" : "▲"}
        </button>
      </div>
      <div className="panel-body">
        <section style={{ marginBottom: 20 }}>
          <PlanningManager />
        </section>
        <section>
          {selectedPlanningPoint ? (
            <>
              <div
                className="subheader"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 12,
                  color: "#64748b",
                  marginBottom: 16,
                }}
              >
                <span>
                  <strong>候选点：</strong>
                  {selectedPlanningPoint.name}
                </span>
                <span>
                  状态：{statusMeta?.label ?? "--"} · 半径 {selectedPlanningPoint.radiusMeters}m ·
                  分析范围 {analysisRadiusKm}
                </span>
                <span>
                  坐标：{selectedPlanningPoint.longitude.toFixed(5)} ,{" "}
                  {selectedPlanningPoint.latitude.toFixed(5)}
                </span>
              </div>
              {analysisError && (!selectedAnalysis || !isLoading) ? (
                <p style={{ fontSize: 12, color: "#dc2626", margin: "0 0 16px" }}>{analysisError}</p>
              ) : null}
              {isLoading ? (
                <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                  正在计算「{selectedPlanningPoint.name}」3km 范围内的品牌分布，请稍候…
                </p>
              ) : selectedAnalysis ? (
                <>
                  <section>
                    <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>品牌竞争概览</h3>
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
                  </section>
                  <section>
                    <h3 style={{ margin: "16px 0 12px", fontSize: 15 }}>品牌密度等级</h3>
                    <div className="metric-card">
                      <h5>密度等级</h5>
                      <strong>{densityDisplay}</strong>
                      <div className="tag">热力图参考</div>
                    </div>
                  </section>
                  <section>
                    <h3 style={{ margin: "16px 0 12px", fontSize: 15 }}>示例门店</h3>
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
                  </section>
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 12 }}>
                    提示：当前分析结果基于 3km 范围，后续将支持自定义多半径指标。
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                  请选择主品牌及竞品关键词，系统会自动基于 3km 范围输出竞争概览。
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
              请在上方列表中选择或新增候选点，以查看 3km 范围的目标点位分析结果。
            </p>
          )}
        </section>
      </div>
      <div className="panel-footer">
        <span style={{ fontSize: 12, color: "#64748b" }}>
          数据面板更新时间：{lastUpdatedText}
        </span>
        <div className="actions">
          <button className="secondary" type="button" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    </aside>
  );
}
