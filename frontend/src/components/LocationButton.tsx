import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationArrow, faLocationCrosshairs, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { locationService, type LocationPosition, type LocationStatus, type LocationError } from "../services/locationService";
import "./LocationButton.css";

interface LocationButtonProps {
  onLocationFound?: (position: LocationPosition) => void;
  onError?: (error: LocationError) => void;
  className?: string;
}

export function LocationButton({ onLocationFound, onError, className = "" }: LocationButtonProps): JSX.Element {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [error, setError] = useState<LocationError | null>(null);

  const handleClick = async () => {
    // 检查浏览器支持
    if (!locationService.isSupported()) {
      const error = { code: 0, message: '您的浏览器不支持地理位置功能。请使用支持地理位置的现代浏览器。' };
      setError(error);
      setStatus('error');
      onError?.(error);
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const position = await locationService.getCurrentPosition();
      setStatus('success');
      setError(null);
      onLocationFound?.(position);
      
      console.log('[Location] 定位成功:', position);
      
      // 3秒后重置状态
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    } catch (err) {
      const locationError = err as LocationError;
      setStatus('error');
      setError(locationError);
      onError?.(locationError);
      
      console.error('[Location] 定位失败:', locationError);
      
      // 8秒后重置状态（给用户足够时间阅读错误信息）
      setTimeout(() => {
        setStatus('idle');
        setError(null);
      }, 8000);
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'loading':
        return faLocationCrosshairs;
      case 'success':
        return faLocationArrow;
      case 'error':
        return faExclamationTriangle;
      default:
        return faLocationArrow;
    }
  };

  const getButtonClass = () => {
    const baseClass = "location-button transition-all duration-200";
    const statusClass = {
      idle: "bg-blue-500 hover:bg-blue-600 text-white",
      loading: "bg-blue-500 text-white",
      success: "bg-green-500 text-white",
      error: "bg-red-500 text-white hover:bg-red-600",
    } as const;

    return `${baseClass} ${statusClass[status]} ${className}`.trim();
  };

  const getAriaLabel = () => {
    switch (status) {
      case 'loading':
        return '正在定位中...';
      case 'success':
        return '定位成功';
      case 'error':
        return error?.message || '定位失败';
      default:
        return '定位到当前位置';
    }
  };

  return (
    <div className="location-button-container">
      <button
        className={getButtonClass()}
        onClick={handleClick}
        disabled={status === 'loading'}
        aria-label={getAriaLabel()}
        title={getAriaLabel()}
      >
        <FontAwesomeIcon 
          icon={getIcon()} 
          className={status === 'loading' ? 'animate-spin' : ''}
        />
      </button>
      
      {/* 状态提示 */}
      {status === 'loading' && (
        <div className="location-tooltip location-tooltip--loading">
          定位中...
        </div>
      )}
      
      {status === 'success' && (
        <div className="location-tooltip location-tooltip--success">
          定位成功
        </div>
      )}
      
      {status === 'error' && error && (
        <div className="location-tooltip location-tooltip--error">
          {error.message}
        </div>
      )}
    </div>
  );
}
