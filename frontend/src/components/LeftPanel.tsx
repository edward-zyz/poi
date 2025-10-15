import { useMemo } from "react";

import { usePoiStore } from "../store/usePoiStore";
import { PlanningManager } from "./PlanningManager";

export function LeftPanel(): JSX.Element {
  const {
    leftCollapsed,
    toggleLeft,
    densityResult,
    analysisResult,
    competitorInput,
    showHeatmap,
    showMainPois,
    showCompetitorPois,
    toggleHeatmap,
    toggleMainPois,
    toggleCompetitorPois,
    heatmapRadius,
    heatmapOpacity,
    setHeatmapRadius,
    setHeatmapOpacity,
  } = usePoiStore();

  const competitorKeywords = useMemo(() => {
    return competitorInput
      .split(/[，,;\s]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [competitorInput]);

  const totalMainPois = densityResult?.mainBrandPois?.length ?? null;
  const competitorCounts = useMemo(() => {
    if (!densityResult) return [] as Array<{ keyword: string; count: number }>;
    return densityResult.competitorKeywords.map((keyword) => {
      const count = densityResult.competitorPois.filter(
        (poi) => poi.keyword === keyword.toLowerCase()
      ).length;
      return { keyword, count };
    });
  }, [densityResult]);

  return (
    <aside className={`panel panel-top left ${leftCollapsed ? "collapsed" : ""}`}>
      <div className="panel-header">
        <h2>图层管理</h2>
        <button type="button" onClick={toggleLeft}>
          {leftCollapsed ? "▼" : "▲"}
        </button>
      </div>
      <div className="panel-body">
        <section>
          <div className="layer-toggle">
            <span className="layer-title">品牌集中度图</span>
            <button
              type="button"
              className={`toggle ${showHeatmap ? "active" : ""}`}
              onClick={toggleHeatmap}
              aria-pressed={showHeatmap}
            />
          </div>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
            根据输入关键词生成热力分布，识别餐饮高密度商圈。
          </p>
          <p style={{ fontSize: 12, color: "#1f2937", margin: 0 }}>
            总计 POI：{densityResult ? densityResult.totalPois : "--"} 家
            {densityResult?.mainBrand?.label ? ` · 主品牌：${densityResult.mainBrand.label}` : ""}
          </p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#64748b", display: "flex", flexDirection: "column", gap: 4 }}>
              热力半径（{heatmapRadius}px）
              <input
                type="range"
                min={20}
                max={80}
                step={5}
                value={heatmapRadius}
                onChange={(event) => setHeatmapRadius(Number(event.target.value))}
              />
            </label>
            <label style={{ fontSize: 12, color: "#64748b", display: "flex", flexDirection: "column", gap: 4 }}>
              透明度（{heatmapOpacity.toFixed(2)}）
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={heatmapOpacity}
                onChange={(event) => setHeatmapOpacity(Number(event.target.value))}
              />
            </label>
          </div>
        </section>
        <section>
          <hr className="layer-divider" />
          <div className="layer-toggle">
            <span className="layer-title">主品牌门店</span>
            <button
              type="button"
              className={`toggle ${showMainPois ? "active" : ""}`}
              onClick={toggleMainPois}
              aria-pressed={showMainPois}
            />
          </div>
          <div className="radius-options">
            <div className="radius-chip active">500m</div>
            <div className="radius-chip">800m</div>
            <div className="radius-chip">1000m</div>
          </div>
          {analysisResult ? (
            <p style={{ fontSize: 12, color: "#1f2937", margin: 0 }}>
              已识别 {analysisResult.samplePois.mainBrand.length} 家附近门店
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              点击地图标记候选点以查看门店分布
            </p>
          )}
          <p style={{ fontSize: 12, color: "#0f172a", margin: "8px 0 0" }}>
            全市总数：{totalMainPois ?? "--"} 家
          </p>
        </section>
        <section>
          <hr className="layer-divider" />
          <div className="layer-toggle">
            <span className="layer-title">竞品品牌门店</span>
            <button
              type="button"
              className={`toggle ${showCompetitorPois ? "active" : ""}`}
              onClick={toggleCompetitorPois}
              aria-pressed={showCompetitorPois}
            />
          </div>
          <div className="radius-options">
            <div className="radius-chip active">100m</div>
            <div className="radius-chip">300m</div>
            <div className="radius-chip">500m</div>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span>当前竞品：</span>
            {competitorCounts.length > 0 ? (
              competitorCounts.map((item) => (
                <span key={item.keyword} style={{ color: "#0f172a" }}>
                  {item.keyword} · {item.count} 家
                </span>
              ))
            ) : (
              <span>-</span>
            )}
          </div>
        </section>
        <section>
          <hr className="layer-divider" />
          <PlanningManager />
        </section>
      </div>
    </aside>
  );
}
