import { LeftPanel } from "./components/LeftPanel";
import { MapView } from "./components/MapView";
import { RightPanel } from "./components/RightPanel";
import { CacheManager } from "./components/CacheManager";
import { useInitializeApp } from "./hooks/useInitializeApp";
import "./styles/app.css";

function AppContent(): JSX.Element {
  // 初始化应用，加载规划点位数据
  useInitializeApp();

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <MapView />
      <LeftPanel />
      <RightPanel />
      <CacheManager />
    </div>
  );
}

export default function App(): JSX.Element {
  return <AppContent />;
}
