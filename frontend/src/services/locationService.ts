export interface LocationPosition {
  lng: number;
  lat: number;
  accuracy?: number;
}

export interface LocationError {
  code: number;
  message: string;
}

export type LocationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface LocationState {
  status: LocationStatus;
  position: LocationPosition | null;
  error: LocationError | null;
}

export class LocationService {
  private static instance: LocationService;
  private watchers: number = 0;

  private constructor() {}

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  /**
   * 检查浏览器是否支持地理位置
   */
  isSupported(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * 获取当前位置
   */
  async getCurrentPosition(options?: PositionOptions): Promise<LocationPosition> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject({
          code: 0,
          message: '您的浏览器不支持地理位置功能。请使用支持地理位置的现代浏览器。'
        });
        return;
      }

      // 针对移动设备优化选项
      const defaultOptions: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 15000, // 增加超时时间
        maximumAge: 300000, // 5分钟内的缓存
        ...options
      };

      // 移动设备特殊处理
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        defaultOptions.timeout = 20000; // 移动设备更长的超时
        defaultOptions.enableHighAccuracy = false; // 移动设备使用快速定位优先
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lng: position.coords.longitude,
            lat: position.coords.latitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          reject(this.formatError(error));
        },
        defaultOptions
      );
    });
  }

  /**
   * 开始监听位置变化
   */
  watchPosition(callback: (position: LocationPosition) => void, errorCallback?: (error: LocationError) => void): number {
    if (!this.isSupported()) {
      errorCallback?.({
        code: 0,
        message: '您的浏览器不支持地理位置功能'
      });
      return -1;
    }

    return navigator.geolocation.watchPosition(
      (position) => {
        callback({
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        errorCallback?.(this.formatError(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );
  }

  /**
   * 停止监听位置变化
   */
  clearWatch(watchId: number): void {
    if (watchId !== -1) {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  /**
   * 格式化错误信息
   */
  private formatError(error: GeolocationPositionError): LocationError {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        if (isMobile) {
          return {
            code: error.code,
            message: '您拒绝了位置权限。请在iPhone设置 → 隐私与安全性 → 位置服务中允许浏览器访问位置。'
          };
        } else {
          return {
            code: error.code,
            message: '您拒绝了位置访问权限。请在浏览器地址栏左侧的位置图标中允许访问位置信息，或在浏览器设置中启用位置服务。'
          };
        }
      case error.POSITION_UNAVAILABLE:
        if (isMobile) {
          return {
            code: error.code,
            message: '无法获取位置信息。请检查iPhone设置 → 隐私与安全性 → 位置服务是否已开启，并确保网络连接正常。'
          };
        } else {
          return {
            code: error.code,
            message: '无法获取位置信息。请检查设备的位置服务是否开启，并确保您已连接到互联网。'
          };
        }
      case error.TIMEOUT:
        return {
          code: error.code,
          message: '获取位置信息超时。请检查网络连接，或在更开阔的地方重试。'
        };
      default:
        return {
          code: error.code,
          message: `获取位置信息失败：${error.message}。请重试或联系技术支持。`
        };
    }
  }

  /**
   * 计算两点之间的距离（米）
   */
  calculateDistance(pos1: LocationPosition, pos2: LocationPosition): number {
    const R = 6371e3; // 地球半径（米）
    const φ1 = (pos1.lat * Math.PI) / 180;
    const φ2 = (pos2.lat * Math.PI) / 180;
    const Δφ = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const Δλ = ((pos2.lng - pos1.lng) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * 判断位置是否在指定范围内
   */
  isWithinRange(center: LocationPosition, target: LocationPosition, rangeMeters: number): boolean {
    const distance = this.calculateDistance(center, target);
    return distance <= rangeMeters;
  }
}

// 导出单例实例
export const locationService = LocationService.getInstance();