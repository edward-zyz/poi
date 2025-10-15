import { useEffect } from "react";
import { useIsMobile } from "../hooks/useIsMobile";

interface SlidePanelProps {
  position: "left" | "right";
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  backdrop?: boolean;
}

export function SlidePanel({ 
  position, 
  isOpen, 
  onClose, 
  children, 
  width = "320px",
  backdrop = true 
}: SlidePanelProps): JSX.Element {
  const isMobile = useIsMobile();

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when panel is open on mobile
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isMobile, isOpen]);

  return (
    <>
      {/* Backdrop */}
      {backdrop && isOpen && (
        <div 
          className={`slide-panel-backdrop ${position}`}
          onClick={onClose}
        />
      )}
      
      {/* Panel */}
      <div 
        className={`slide-panel slide-panel-${position} ${isOpen ? "open" : "closed"}`}
        style={{ 
          "--panel-width": isMobile ? "100%" : width,
          "--panel-height": isMobile ? "70vh" : "auto"
        } as React.CSSProperties}
      >
        <div className="slide-panel-content">
          {children}
        </div>
      </div>
    </>
  );
}