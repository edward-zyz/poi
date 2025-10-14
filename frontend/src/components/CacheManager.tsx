import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

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

export function CacheManager(): JSX.Element | null {
  const { adminVisible, closeAdmin, city } = usePoiStore();

  const [keywordInput, setKeywordInput] = useState<string>("");

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
    onSuccess: (data) => {
      if (typeof window !== "undefined") {
        (window as any).lastCacheStats = data;
      }
    },
  });

  const refreshMutation = useMutation<CacheRefreshResponse, Error, string[]>({
    mutationFn: (keywords) => refreshCache({ city, keywords }),
    onSuccess: () => {
      statsQuery.refetch();
    },
  });

  const stats = statsQuery.data?.stats ?? [];
  const totalPois = statsQuery.data?.total ?? 0;

  const isRefreshing = refreshMutation.isLoading;
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
    refreshMutation.mutate(keywords);
  };

  const lastRefreshMessage = useMemo(() => {
    if (refreshMutation.data) {
      return `上次刷新：${refreshMutation.data.totalFetched} 条（${new Date(
        refreshMutation.data.generatedAt * 1000
      ).toLocaleTimeString()}）`;
    }
    return "";
  }, [refreshMutation.data]);

  if (!adminVisible) {
    return null;
  }

  return (
    <div className="cache-overlay" role="dialog" aria-modal="true">
      <div className="cache-panel">
        <div className="cache-header">
          <h2>POI 缓存管理</h2>
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
              <button type="button" onClick={handleRefresh} disabled={isRefreshing}>
                {isRefreshing ? "刷新中..." : "刷新缓存"}
              </button>
            </div>
            {lastRefreshMessage && <p className="hint">{lastRefreshMessage}</p>}
            {refreshMutation.isError && (
              <p className="error">刷新失败：{refreshMutation.error?.message}</p>
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
