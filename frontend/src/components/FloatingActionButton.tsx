import { useState } from "react";
import { usePoiStore } from "../store/usePoiStore";

interface FloatingActionButtonProps {
  onAddPoint: () => void;
  onToggleSearch: () => void;
  showSearch: boolean;
}

export function FloatingActionButton({ 
  onAddPoint, 
  onToggleSearch, 
  showSearch 
}: FloatingActionButtonProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const { city, mainBrandInput, competitorInput, densityResult } = usePoiStore();

  return (
    <div className="fab-container">
      {/* Search Panel */}
      {showSearch && (
        <div className="fab-search-panel">
          <div className="fab-search-header">
            <h3>快速筛选</h3>
            <button onClick={onToggleSearch} className="fab-close">×</button>
          </div>
          
          <div className="fab-search-content">
            <div className="fab-status">
              <span className="fab-city">{city}</span>
              {densityResult && (
                <span className="fab-stats">
                  {densityResult.totalPois} 家POI
                </span>
              )}
            </div>
            
            {mainBrandInput && (
              <div className="fab-brand-info">
                <span className="fab-brand-label">主品牌:</span>
                <span className="fab-brand-name">{mainBrandInput}</span>
              </div>
            )}
            
            {competitorInput && (
              <div className="fab-brand-info">
                <span className="fab-brand-label">竞品:</span>
                <span className="fab-brand-name">{competitorInput}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main FAB */}
      <div className={`fab-main ${expanded ? "expanded" : ""}`}>
        {/* Secondary buttons */}
        <button 
          className="fab-secondary fab-search-btn"
          onClick={onToggleSearch}
          title="筛选信息"
        >
          <span className="fab-icon">🔍</span>
        </button>
        
        <button 
          className="fab-secondary fab-add-btn"
          onClick={onAddPoint}
          title="添加候选点位"
        >
          <span className="fab-icon">📍</span>
        </button>
        
        {/* Main toggle button */}
        <button 
          className="fab-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          <span className={`fab-icon ${expanded ? "expanded" : ""}`}>
            {expanded ? "✕" : "🎯"}
          </span>
        </button>
      </div>
    </div>
  );
}