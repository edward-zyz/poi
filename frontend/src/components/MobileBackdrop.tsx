import { usePoiStore } from "../store/usePoiStore";
import { useIsMobile } from "../hooks/useIsMobile";

export function MobileBackdrop(): JSX.Element {
  const { leftCollapsed, rightCollapsed } = usePoiStore();
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  const showBackdrop = !leftCollapsed || !rightCollapsed;

  return (
    <div 
      className={`mobile-backdrop ${showBackdrop ? "active" : ""}`}
      onClick={() => {
        // Close both panels when backdrop is clicked
        if (!leftCollapsed) {
          const { toggleLeft } = usePoiStore.getState();
          toggleLeft();
        }
        if (!rightCollapsed) {
          const { toggleRight } = usePoiStore.getState();
          toggleRight();
        }
      }}
    />
  );
}