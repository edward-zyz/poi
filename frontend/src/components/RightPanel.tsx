import { useMemo } from "react";

import { usePoiStore } from "../store/usePoiStore";

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
  const { rightCollapsed, toggleRight, analysisResult, densityResult } = usePoiStore();

  const densityDisplay = useMemo(() => formatDensity(analysisResult?.densityLevel), [analysisResult]);

  return (
    <aside className={`panel panel-top right ${rightCollapsed ? "collapsed" : ""}`}>
      <div className="panel-header">
        <h2>目标点位数据面板</h2>
        <button type="button" onClick={toggleRight}>
          {rightCollapsed ? "▼" : "▲"}
        </button>
      </div>
      <div className="panel-body">
        {analysisResult ? (
          <>
            <div className="subheader" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              <span>
                <strong>候选点：</strong>
                {analysisResult.mainBrandLabel} · {analysisResult.city}
              </span>
              <span>
                坐标：{analysisResult.target.lng.toFixed(5)} , {analysisResult.target.lat.toFixed(5)} · 半径 {analysisResult.radiusMeters}m
              </span>
              <span>数据来源：{analysisResult.source}</span>
            </div>
            <section>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>品牌竞争概览</h3>
              <div className="metric-grid">
                <div className="metric-card">
                  <h5>主品牌门店 (500m)</h5>
                  <strong>{analysisResult.counts.mainBrand500m}</strong>
                  <div className="tag">圈内</div>
                </div>
                <div className="metric-card">
                  <h5>主品牌门店 (1000m)</h5>
                  <strong>{analysisResult.counts.mainBrand1000m}</strong>
                  <div className="tag">圈内</div>
                </div>
                <div className="metric-card">
                  <h5>竞品门店 (100m)</h5>
                  <strong>{analysisResult.counts.competitor100m}</strong>
                  <div className="tag">直接竞争</div>
                </div>
                <div className="metric-card">
                  <h5>竞品门店 (1000m)</h5>
                  <strong>{analysisResult.counts.competitor1000m}</strong>
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
                <p>{analysisResult.samplePois.mainBrand.slice(0, 3).map((poi) => poi.name).join("、") || "--"}</p>
              </div>
              <div className="poi-card">
                <h4>竞品样例</h4>
                <p>{analysisResult.samplePois.competitors.slice(0, 3).map((poi) => poi.name).join("、") || "--"}</p>
              </div>
            </section>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "#64748b" }}>
            点击地图任意位置即可生成目标点位分析。系统会计算主品牌与竞品在 100m-1000m 内的分布，并基于热力图给出密度等级。
          </p>
        )}
      </div>
      <div className="panel-footer">
        <span style={{ fontSize: 12, color: "#64748b" }}>
          数据面板更新时间：
          {analysisResult ? new Date(analysisResult.generatedAt * 1000).toLocaleTimeString() : densityResult ? new Date(densityResult.generatedAt * 1000).toLocaleTimeString() : "--"}
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
