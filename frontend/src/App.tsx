import { useState } from "react";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { CacheManager } from "./components/CacheManager";
import { BottomTabBar } from "./components/BottomTabBar";
import { FloatingActionButton } from "./components/FloatingActionButton";
import { SlidePanel } from "./components/SlidePanel";
import { PlanningSlidePanel } from "./components/PlanningSlidePanel";
import { AnalysisSlidePanel } from "./components/AnalysisSlidePanel";
import { POIDetailCard } from "./components/POIDetailCard";
import { MapView } from "./components/MapView";
import { useInitializeApp } from "./hooks/useInitializeApp";
import { useIsMobile } from "./hooks/useIsMobile";
import { usePoiStore } from "./store/usePoiStore";
import "./styles/app.css";

function AppContent(): JSX.Element {
  // 初始化应用，加载规划点位数据
  useInitializeApp();
  const isMobile = useIsMobile();
  
  const [showSearch, setShowSearch] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState<any>(null);
  const [showPOIDetail, setShowPOIDetail] = useState(false);
  
  const {
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
    adminVisible,
    closeAdmin,
    setAwaitingPlanningMapClick,
  } = usePoiStore();

  const handleAddPoint = () => {
    if (adminVisible) {
      closeAdmin();
    }
    setAwaitingPlanningMapClick(true);
    toggleLeft(); // Open planning panel
  };

  const handlePOIClick = (poi: any, position: { lng: number; lat: number }) => {
    setSelectedPOI({ ...poi, position });
    setShowPOIDetail(true);
  };

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <MapView 
        onPOIClick={isMobile ? handlePOIClick : undefined}
        onMapLongPress={isMobile ? handleAddPoint : undefined}
      />
      
      {/* Desktop Panels */}
      {!isMobile && (
        <>
          <LeftPanel />
          <RightPanel />
          <CacheManager />
        </>
      )}
      
      {/* Mobile Components */}
      {isMobile && (
        <>
          {/* Slide Panels */}
          <SlidePanel 
            position="left" 
            isOpen={!leftCollapsed} 
            onClose={toggleLeft}
          >
            <PlanningSlidePanel />
          </SlidePanel>
          
          <SlidePanel 
            position="right" 
            isOpen={!rightCollapsed} 
            onClose={toggleRight}
          >
            <AnalysisSlidePanel />
          </SlidePanel>
          
          {/* Cache Manager in slide panel */}
          {adminVisible && (
            <SlidePanel 
              position="left" 
              isOpen={adminVisible} 
              onClose={closeAdmin}
              backdrop={false}
            >
              <div className="slide-panel-content">
                <div className="slide-panel-header">
                  <h2>POI 管理</h2>
                </div>
                <div className="slide-panel-body">
                  <CacheManager />
                </div>
              </div>
            </SlidePanel>
          )}
          
          {/* Bottom Navigation */}
          <BottomTabBar />
          
          {/* Floating Action Button */}
          <FloatingActionButton 
            onAddPoint={handleAddPoint}
            onToggleSearch={() => setShowSearch(!showSearch)}
            showSearch={showSearch}
          />
          
          {/* POI Detail Card */}
          {showPOIDetail && selectedPOI && (
            <div className="poi-detail-overlay" onClick={() => setShowPOIDetail(false)}>
              <POIDetailCard
                poi={selectedPOI}
                position={selectedPOI.position}
                onClose={() => setShowPOIDetail(false)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function App(): JSX.Element {
  return <AppContent />;
}
