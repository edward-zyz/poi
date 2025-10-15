import { useState } from "react";
import { usePoiStore } from "../store/usePoiStore";

export function BottomTabBar(): JSX.Element {
  const [activeTab, setActiveTab] = useState<"home" | "analysis" | "planning" | "settings">("home");
  const {
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
    adminVisible,
    closeAdmin,
  } = usePoiStore();

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    
    // Close all panels first
    if (!leftCollapsed) toggleLeft();
    if (!rightCollapsed) toggleRight();
    if (adminVisible) closeAdmin();
    
    // Open relevant panel with slight delay for animation
    setTimeout(() => {
      switch (tab) {
        case "analysis":
          toggleRight();
          break;
        case "planning":
          toggleLeft();
          break;
        case "settings":
          toggleLeft();
          break;
        // home tab keeps all panels closed
      }
    }, 100);
  };

  return (
    <div className="bottom-tab-bar">
      <button
        className={`tab-item ${activeTab === "home" ? "active" : ""}`}
        onClick={() => handleTabChange("home")}
      >
        <span className="tab-icon">🏠</span>
        <span className="tab-label">首页</span>
      </button>
      
      <button
        className={`tab-item ${activeTab === "analysis" ? "active" : ""}`}
        onClick={() => handleTabChange("analysis")}
      >
        <span className="tab-icon">📊</span>
        <span className="tab-label">分析</span>
      </button>
      
      <button
        className={`tab-item ${activeTab === "planning" ? "active" : ""}`}
        onClick={() => handleTabChange("planning")}
      >
        <span className="tab-icon">📍</span>
        <span className="tab-label">规划</span>
      </button>
      
      <button
        className={`tab-item ${activeTab === "settings" ? "active" : ""}`}
        onClick={() => handleTabChange("settings")}
      >
        <span className="tab-icon">⚙️</span>
        <span className="tab-label">设置</span>
      </button>
    </div>
  );
}