import { usePoiStore } from "../store/usePoiStore";
import { useIsMobile } from "../hooks/useIsMobile";

export function FloatingActionButtons(): JSX.Element {
  const isMobile = useIsMobile();
  
  const {
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
    adminVisible,
    setAdminVisible,
    closeAdmin,
  } = usePoiStore();

  // 只在移动端显示
  if (!isMobile) {
    return null;
  }

  const handleSettingsClick = () => {
    if (!rightCollapsed) {
      toggleRight(); // 关闭候选点位管理面板
    } else {
      // 关闭其他面板，打开候选点位管理面板
      if (!leftCollapsed) toggleLeft();
      if (adminVisible) closeAdmin();
      toggleRight(); // 打开候选点位管理面板
    }
  };

  const handlePlanningClick = () => {
    if (!leftCollapsed) {
      toggleLeft(); // 关闭规划面板
    } else {
      // 关闭其他面板，打开规划面板
      if (!rightCollapsed) toggleRight();
      if (adminVisible) closeAdmin();
      toggleLeft(); // 打开规划面板
    }
  };

  const isSettingsOpen = !rightCollapsed; // 候选点位管理面板是否打开
  const isPlanningOpen = !leftCollapsed;  // 规划面板是否打开

  return (
    <>
      {/* Settings Button */}
      <button
        className={`fab-button fab-settings ${isSettingsOpen ? 'active' : ''}`}
        onClick={handleSettingsClick}
        title={isSettingsOpen ? "关闭候选点位管理" : "候选点位管理"}
      >
        {isSettingsOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11H3v2h6v-2zm0-4H3v2h6V7zm0 8H3v2h6v-2zm12-8h-6v2h6V7zm0 4h-6v2h6v-2zm0 4h-6v2h6v-2z"></path>
          </svg>
        )}
      </button>

      {/* Planning Button */}
      <button
        className={`fab-button fab-planning ${isPlanningOpen ? 'active' : ''}`}
        onClick={handlePlanningClick}
        title={isPlanningOpen ? "关闭规划" : "规划"}
      >
        {isPlanningOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h18v18H3zM12 8v8m-4-4h8"></path>
          </svg>
        )}
      </button>
    </>
  );
}