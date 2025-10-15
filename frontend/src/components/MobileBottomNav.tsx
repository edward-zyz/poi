import { useState } from "react";
import { usePoiStore } from "../store/usePoiStore";

export function MobileBottomNav(): JSX.Element {
  const {
    city,
    setCity,
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
    showHeatmap,
    showMainPois,
    showCompetitorPois,
    toggleHeatmap,
    toggleMainPois,
    toggleCompetitorPois,
  } = usePoiStore();

  const [activeTab, setActiveTab] = useState<"analysis" | "planning" | "layers">("analysis");

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    // Close both panels first
    if (!leftCollapsed) toggleLeft();
    if (!rightCollapsed) toggleRight();
    
    // Open the relevant panel
    if (tab === "analysis") {
      setTimeout(() => toggleLeft(), 100);
    } else if (tab === "planning") {
      setTimeout(() => toggleRight(), 100);
    }
  };

  return (
    <div className="mobile-bottom-nav">
      <div className="mobile-nav-tabs">
        <button
          className={`mobile-nav-tab ${activeTab === "analysis" ? "active" : ""}`}
          onClick={() => handleTabChange("analysis")}
        >
          <span className="mobile-nav-icon">📊</span>
          <span className="mobile-nav-label">品牌分析</span>
        </button>
        
        <button
          className={`mobile-nav-tab ${activeTab === "planning" ? "active" : ""}`}
          onClick={() => handleTabChange("planning")}
        >
          <span className="mobile-nav-icon">📍</span>
          <span className="mobile-nav-label">候选点位</span>
        </button>
        
        <button
          className={`mobile-nav-tab ${activeTab === "layers" ? "active" : ""}`}
          onClick={() => handleTabChange("layers")}
        >
          <span className="mobile-nav-icon">👁️</span>
          <span className="mobile-nav-label">图层</span>
        </button>
      </div>

      {activeTab === "layers" && (
        <div className="mobile-layer-controls">
          <div className="mobile-layer-item">
            <span>品牌热力图</span>
            <button
              className={`mobile-toggle ${showHeatmap ? "active" : ""}`}
              onClick={toggleHeatmap}
            />
          </div>
          <div className="mobile-layer-item">
            <span>主品牌门店</span>
            <button
              className={`mobile-toggle ${showMainPois ? "active" : ""}`}
              onClick={toggleMainPois}
            />
          </div>
          <div className="mobile-layer-item">
            <span>竞品门店</span>
            <button
              className={`mobile-toggle ${showCompetitorPois ? "active" : ""}`}
              onClick={toggleCompetitorPois}
            />
          </div>
        </div>
      )}

      <div className="mobile-nav-info">
        <span className="mobile-city">{city}</span>
        <span className="mobile-status">
          {showHeatmap && "热力图 "}
          {showMainPois && "主品牌 "}
          {showCompetitorPois && "竞品"}
        </span>
      </div>
    </div>
  );
}