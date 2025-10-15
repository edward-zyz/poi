import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useRef } from "react";

import {
  fetchCacheStats,
  refreshCache,
  type CacheKeywordStat,
  type CacheRefreshResponse,
  type CacheStatsResponse,
} from "../services/api";
import { usePoiStore } from "../store/usePoiStore";
import { parseKeywords } from "../utils/keywords";
import { baseBrands } from "../data/baseBrands";

function formatTimestamp(timestamp?: number | null): string {
  if (!timestamp) return "--";
  return new Date(timestamp * 1000).toLocaleString();
}

const DEFAULT_KEYWORDS = baseBrands.join(", ");

interface LoadingLog {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

export function CacheManager(): JSX.Element | null {
  const { adminVisible, closeAdmin, city } = usePoiStore();

  const [keywordInput, setKeywordInput] = useState<string>("");
  const [loadingLogs, setLoadingLogs] = useState<LoadingLog[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (adminVisible) {
      setKeywordInput(DEFAULT_KEYWORDS);
    }
  }, [adminVisible]);

  const statsQuery = useQuery<CacheStatsResponse>({
    queryKey: ["poi-cache-stats", city],
    queryFn: () => fetchCacheStats(city),
    enabled: adminVisible,
    staleTime: 30_000,
  });

  // 在数据更新时保存到全局
  useEffect(() => {
    if (statsQuery.data && typeof window !== "undefined") {
      (window as any).lastCacheStats = statsQuery.data;
    }
  }, [statsQuery.data]);

  const refreshMutation = useMutation<CacheRefreshResponse, Error, string[]>({
    mutationFn: async (keywords) => {
      // 创建新的 AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      try {
        setIsRefreshing(true);
        addLog('开始刷新缓存...', 'info');
        
        const result = await refreshCache({ city, keywords });
        
        addLog(`缓存刷新完成，共获取 ${result.totalFetched} 条数据`, 'success');
        
        // 逐个显示关键词结果
        result.results.forEach((item, index) => {
          setTimeout(() => {
            addLog(`"${item.keyword}" - 获取 ${item.fetched} 条`, 'success');
          }, index * 100);
        });
        
        return result;
      } catch (error) {
        addLog(`刷新失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
        throw error;
      } finally {
        setIsRefreshing(false);
        abortControllerRef.current = null;
      }
    },
    onSuccess: () => {
      // 延迟刷新统计数据，等待日志显示完成
      setTimeout(() => {
        statsQuery.refetch();
      }, 1000);
    },
  });

  const addLog = (message: string, type: LoadingLog['type']) => {
    const newLog: LoadingLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      message,
      type
    };
    
    setLoadingLogs(prev => [...prev, newLog]);
    
    // 限制日志数量，最多保留20条
    setTimeout(() => {
      setLoadingLogs(prev => prev.slice(-20));
    }, 100);
  };

  const clearLogs = () => {
    setLoadingLogs([]);
  };

  const stats = statsQuery.data?.stats ?? [];
  const totalPois = statsQuery.data?.total ?? 0;

  const isFetchingStats = statsQuery.isLoading || statsQuery.isFetching;

  const handleUseDefault = () => {
    setKeywordInput(DEFAULT_KEYWORDS);
  };

  const handleRefresh = () => {
    const keywords = parseKeywords(keywordInput);
    if (keywords.length === 0) {
      alert("请输入至少一个关键词");
      return;
    }
    
    if (isRefreshing) {
      alert("正在刷新中，请等待完成");
      return;
    }
    
    clearLogs();
    refreshMutation.mutate(keywords);
  };

  // 组件卸载时取消请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 监听页面关闭事件
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRefreshing) {
        e.preventDefault();
        const message = '数据正在刷新中，确定要离开吗？';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRefreshing]);

  const lastRefreshMessage = useMemo(() => {
    if (refreshMutation.data) {
      return `上次刷新：${refreshMutation.data.totalFetched} 条（${new Date(
        refreshMutation.data.generatedAt * 1000
      ).toLocaleTimeString()}）`;
    }
    return "";
  }, [refreshMutation.data]);

  // 监听 visibilitychange 事件，页面切换时保持状态
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRefreshing) {
        // 页面隐藏时，在控制台记录状态
        console.log('页面已隐藏，但缓存刷新仍在后台进行中...');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRefreshing]);

  if (!adminVisible) {
    return null;
  }

  return (
    <div className="cache-overlay" role="dialog" aria-modal="true">
      <div className="cache-panel">
        <div className="cache-header">
          <h2>POI管理</h2>
          <button type="button" className="close-btn" onClick={closeAdmin}>
            ×
          </button>
        </div>
        <div className="cache-body">
          <section className="cache-section">
            <div className="cache-row">
              <span className="label">当前城市</span>
              <strong>{city}</strong>
            </div>
            <div className="cache-row">
              <span className="label">刷新关键词</span>
              <textarea
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="用逗号、空格或换行分隔关键词"
              />
            </div>
            <div className="cache-actions">
              <button type="button" onClick={handleUseDefault} className="secondary">
                使用默认关键词
              </button>
              <button 
                type="button" 
                onClick={handleRefresh} 
                disabled={isRefreshing || refreshMutation.isPending}
                className={isRefreshing || refreshMutation.isPending ? 'loading' : ''}
              >
                {isRefreshing || refreshMutation.isPending ? (
                  <>
                    <span className="loading-spinner"></span>
                    刷新中...
                  </>
                ) : "刷新缓存"}
              </button>
            </div>
            {lastRefreshMessage && <p className="hint">{lastRefreshMessage}</p>}
            {refreshMutation.isError && (
              <p className="error">刷新失败：{refreshMutation.error?.message}</p>
            )}
            
            {/* 加载日志区域 */}
            {loadingLogs.length > 0 && (
              <div className="loading-logs">
                <div className="logs-header">
                  <span>刷新进度</span>
                  <button 
                    type="button" 
                    onClick={clearLogs}
                    className="clear-logs-btn"
                    disabled={isRefreshing}
                  >
                    清空
                  </button>
                </div>
                <div className="logs-container">
                  {loadingLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className={`log-entry log-${log.type}`}
                    >
                      <span className="log-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="cache-section">
            <div className="cache-row">
              <span className="label">缓存统计</span>
              <span>{isFetchingStats ? "加载中..." : `共 ${totalPois} 条 POI`}</span>
            </div>
            <div className="cache-table-wrapper">
              <table className="cache-table">
                <thead>
                  <tr>
                    <th>关键词</th>
                    <th>数量</th>
                    <th>最近更新</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.length === 0 && !isFetchingStats ? (
                    <tr>
                      <td colSpan={3} className="empty">
                        暂无缓存数据
                      </td>
                    </tr>
                  ) : (
                    stats.map((row: CacheKeywordStat) => (
                      <tr key={`${row.city}-${row.keyword}`}>
                        <td>{row.keyword}</td>
                        <td>{row.count}</td>
                        <td>{formatTimestamp(row.lastFetchedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {statsQuery.data && (
              <p className="hint">统计时间：{formatTimestamp(statsQuery.data.generatedAt)}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
