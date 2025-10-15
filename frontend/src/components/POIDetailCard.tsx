import { useState } from "react";
import type { PoiSummary, PlanningPoint } from "../services/api";

interface POIDetailCardProps {
  poi?: PoiSummary | PlanningPoint;
  position: { lng: number; lat: number };
  onClose: () => void;
  onNavigate?: () => void;
  onShare?: () => void;
}

export function POIDetailCard({ 
  poi, 
  position, 
  onClose, 
  onNavigate, 
  onShare 
}: POIDetailCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  
  const isPlanningPoint = poi && 'status' in poi;
  
  return (
    <div className={`poi-detail-card ${expanded ? "expanded" : "collapsed"}`}>
      {/* Header */}
      <div className="poi-card-header">
        <div className="poi-card-title">
          <h3>{poi?.name || "未知位置"}</h3>
          <span className="poi-card-category">
            {poi?.category || (isPlanningPoint ? "候选点位" : "POI")}
          </span>
        </div>
        <button className="poi-card-close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Basic Info */}
      <div className="poi-card-basic">
        <div className="poi-info-item">
          <span className="poi-info-label">地址</span>
          <span className="poi-info-value">
            {poi?.address || "地址信息获取中..."}
          </span>
        </div>
        
        <div className="poi-info-item">
          <span className="poi-info-label">坐标</span>
          <span className="poi-info-value">
            {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
          </span>
        </div>
        
        {isPlanningPoint && (
          <div className="poi-info-item">
            <span className="poi-info-label">状态</span>
            <span 
              className="poi-info-value poi-status"
              style={{ 
                backgroundColor: (poi as PlanningPoint).color,
                color: "white"
              }}
            >
              {(poi as PlanningPoint).status === "pending" && "待考察"}
              {(poi as PlanningPoint).status === "priority" && "重点跟进"}
              {(poi as PlanningPoint).status === "dropped" && "淘汰"}
            </span>
          </div>
        )}
      </div>

      {/* Expandable Content */}
      {expanded && (
        <div className="poi-card-expanded">
          {isPlanningPoint && (
            <>
              <div className="poi-info-item">
                <span className="poi-info-label">半径</span>
                <span className="poi-info-value">
                  {(poi as PlanningPoint).radiusMeters}m
                </span>
              </div>
              
              <div className="poi-info-item">
                <span className="poi-info-label">优先级</span>
                <span className="poi-info-value">
                  {(poi as PlanningPoint).priorityRank}
                </span>
              </div>
              
              {(poi as PlanningPoint).notes && (
                <div className="poi-info-item">
                  <span className="poi-info-label">备注</span>
                  <span className="poi-info-value">
                    {(poi as PlanningPoint).notes}
                  </span>
                </div>
              )}
            </>
          )}
          
          <div className="poi-info-item">
            <span className="poi-info-label">数据来源</span>
            <span className="poi-info-value">
              {poi?.fetchSource || "系统生成"}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="poi-card-actions">
        <button 
          className="poi-action-btn primary"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起" : "详情"}
        </button>
        
        {onNavigate && (
          <button className="poi-action-btn secondary" onClick={onNavigate}>
            导航
          </button>
        )}
        
        {onShare && (
          <button className="poi-action-btn secondary" onClick={onShare}>
            分享
          </button>
        )}
      </div>
    </div>
  );
}