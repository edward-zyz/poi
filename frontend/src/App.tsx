import { LeftPanel } from "./components/LeftPanel";
import { MapView } from "./components/MapView";
import { RightPanel } from "./components/RightPanel";
import { TopBar } from "./components/TopBar";
import { CacheManager } from "./components/CacheManager";
import "./styles/app.css";

export default function App(): JSX.Element {
  return (
    <div style={{ height: "100%", width: "100%" }}>
      <TopBar />
      <MapView />
      <LeftPanel />
      <RightPanel />
      <CacheManager />
    </div>
  );
}
