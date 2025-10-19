import { useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";

import { suggestBrands } from "../data/baseBrands";
import { fetchBrandDensity } from "../services/api";
import { usePoiStore } from "../store/usePoiStore";
import { parseKeywords } from "../utils/keywords";

const CITY_OPTIONS = ["上海市", "北京市", "广州市", "深圳市", "杭州市", "成都市"];

export function PlanningSlidePanel(): JSX.Element {
  const {
    city,
    setCity,
    mainBrandInput,
    setMainBrandInput,
    competitorInput,
    setCompetitorInput,
    setDensityResult,
    resetPlanningAnalyses,
    densityResult,
    showHeatmap,
    showMainPois,
    showCompetitorPois,
    toggleHeatmap,
    toggleMainPois,
    toggleCompetitorPois,
    heatmapRadius,
    heatmapOpacity,
    mainBrandRadius,
    competitorRadius,
    mainBrandDisplayMode,
    competitorDisplayMode,
    setHeatmapRadius,
    setHeatmapOpacity,
    setMainBrandRadius,
    setCompetitorRadius,
    setMainBrandDisplayMode,
    setCompetitorDisplayMode,
    planningAnalyses,
    selectedPlanningPointId,
    adminVisible,
    toggleAdmin,
    closeAdmin,
  } = usePoiStore();

  const mutation = useMutation({
    mutationFn: fetchBrandDensity,
    onSuccess: (result) => {
      setDensityResult(result);
      resetPlanningAnalyses();
      if (typeof window !== "undefined") {
        (window as any).lastDensityResult = result;
      }
      console.info("[UI] Brand density updated", {
        totalPois: result.totalPois,
        source: result.source,
        heatmapCells: result.heatmap.length,
      });
    },
  });

  useEffect(() => {
    if (mutation.isError) {
      alert((mutation.error as Error).message);
    }
  }, [mutation.isError, mutation.error]);

  const suggestions = useMemo(() => suggestBrands(mainBrandInput), [mainBrandInput]);

  const handleGenerate = () => {
    const mainBrand = mainBrandInput.trim();
    if (!mainBrand) {
      alert("请输入主品牌关键词");
      return;
    }
    const competitors = parseKeywords(competitorInput);

    const keywords = Array.from(new Set([mainBrand, ...competitors]));

    mutation.mutate({
      city,
      keywords,
      mainBrand: mainBrand,
    });
  };

  const competitorKeywords = useMemo(() => {
    return competitorInput
      .split(/[，,;\s]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [competitorInput]);

  const selectedAnalysis = useMemo(() => {
    if (!selectedPlanningPointId) return null;
    return planningAnalyses[selectedPlanningPointId] ?? null;
  }, [planningAnalyses, selectedPlanningPointId]);

  const totalMainPois = densityResult?.mainBrandPois?.length ?? null;
  const competitorCounts = useMemo(() => {
    if (!densityResult) return [] as Array<{ keyword: string; count: number }>;
    return densityResult.competitorKeywords.map((keyword) => {
      const count = densityResult.competitorPois.filter(
        (poi) => poi.keyword === keyword.toLowerCase()
      ).length;
      return { keyword, count };
    });
  }, [densityResult]);

  const handleMainBrandRadiusChange = (radius: number) => {
    setMainBrandRadius(radius);
  };

  const handleCompetitorRadiusChange = (radius: number) => {
    setCompetitorRadius(radius);
  };

  const handleMainBrandDisplayModeChange = (mode: "point" | "circle") => {
    setMainBrandDisplayMode(mode);
  };

  const handleCompetitorDisplayModeChange = (mode: "point" | "circle") => {
    setCompetitorDisplayMode(mode);
  };

  return (
    <div className="slide-panel-content planning-panel">
      <div className="slide-panel-header">
        <h2>品牌分析</h2>
      </div>
      
      <div className="slide-panel-body">
        {/* City and Brand Settings */}
        <section className="panel-section">
          <div className="section-title">
            <span>📍 区域与品牌</span>
          </div>
          
          <div className="control-group">
            <label className="control">
              <span>目标城市</span>
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                {CITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            
            <label className="control">
              <span>主品牌关键词</span>
              <input
                value={mainBrandInput}
                onChange={(event) => setMainBrandInput(event.target.value)}
                placeholder="如：塔斯汀"
              />
              <div className="suggestions">
                {suggestions.map((item) => (
                  <button key={item} type="button" onClick={() => setMainBrandInput(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </label>
            
            <label className="control">
              <span>竞品关键词</span>
              <input
                value={competitorInput}
                onChange={(event) => setCompetitorInput(event.target.value)}
                placeholder="用逗号或空格分隔"
              />
            </label>
            
            </div>
        </section>

        {/* Heatmap Controls */}
        <section className="panel-section">
          <div className="section-title">
            <span>🔥 热力图设置</span>
          </div>
          
          <div className="layer-controls">
            <div className="layer-control">
              <div className="layer-info">
                <span className="layer-title">品牌集中度图</span>
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
                  根据输入关键词生成热力分布，识别餐饮高密度商圈。
                </p>
              </div>
              <button
                type="button"
                className={`toggle ${showHeatmap ? "active" : ""}`}
                onClick={toggleHeatmap}
              />
            </div>
            
            {densityResult && (
              <div className="layer-stats">
                <span>总计 POI：{densityResult.totalPois} 家</span>
                {densityResult?.mainBrand?.label && (
                  <span>主品牌：{densityResult.mainBrand.label}</span>
                )}
              </div>
            )}
            
            {showHeatmap && (
              <div className="layer-settings">
                <label className="range-control">
                  <span>热力半径（{heatmapRadius}px）</span>
                  <input
                    type="range"
                    min={20}
                    max={80}
                    step={5}
                    value={heatmapRadius}
                    onChange={(event) => setHeatmapRadius(Number(event.target.value))}
                  />
                </label>
                
                <label className="range-control">
                  <span>透明度（{heatmapOpacity.toFixed(2)}）</span>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={heatmapOpacity}
                    onChange={(event) => setHeatmapOpacity(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
          </div>
        </section>

        {/* POI Display Controls */}
        <section className="panel-section">
          <div className="section-title">
            <span>🏪 POI 显示设置</span>
          </div>
          
          <div className="poi-controls">
            {/* Main Brand POIs */}
            <div className="poi-control-group">
              <div className="poi-control-header">
                <span className="poi-title">主品牌门店</span>
                <button
                  type="button"
                  className={`toggle ${showMainPois ? "active" : ""}`}
                  onClick={toggleMainPois}
                />
              </div>
              
              {showMainPois && (
                <div className="poi-settings">
                  <div className="radius-options">
                    <button
                      type="button"
                      className={`radius-chip ${mainBrandDisplayMode === "point" ? "active" : ""}`}
                      onClick={() => handleMainBrandDisplayModeChange("point")}
                    >
                      点状
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${mainBrandDisplayMode === "circle" && mainBrandRadius === 500 ? "active" : ""}`}
                      onClick={() => {
                        handleMainBrandDisplayModeChange("circle");
                        handleMainBrandRadiusChange(500);
                      }}
                    >
                      500m
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${mainBrandDisplayMode === "circle" && mainBrandRadius === 1000 ? "active" : ""}`}
                      onClick={() => {
                        handleMainBrandDisplayModeChange("circle");
                        handleMainBrandRadiusChange(1000);
                      }}
                    >
                      1km
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${mainBrandDisplayMode === "circle" && mainBrandRadius === 1500 ? "active" : ""}`}
                      onClick={() => {
                        handleMainBrandDisplayModeChange("circle");
                        handleMainBrandRadiusChange(1500);
                      }}
                    >
                      1.5km
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${mainBrandDisplayMode === "circle" && mainBrandRadius === 2000 ? "active" : ""}`}
                      onClick={() => {
                        handleMainBrandDisplayModeChange("circle");
                        handleMainBrandRadiusChange(2000);
                      }}
                    >
                      2km
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${mainBrandDisplayMode === "circle" && mainBrandRadius === 3000 ? "active" : ""}`}
                      onClick={() => {
                        handleMainBrandDisplayModeChange("circle");
                        handleMainBrandRadiusChange(3000);
                      }}
                    >
                      3km
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: "#0f172a", margin: "8px 0 0" }}>
                    全市总数：{totalMainPois ?? "--"} 家
                  </p>
                </div>
              )}
            </div>
            
            {/* Competitor POIs */}
            <div className="poi-control-group">
              <div className="poi-control-header">
                <span className="poi-title">竞品品牌门店</span>
                <button
                  type="button"
                  className={`toggle ${showCompetitorPois ? "active" : ""}`}
                  onClick={toggleCompetitorPois}
                />
              </div>
              
              {showCompetitorPois && (
                <div className="poi-settings">
                  <div className="radius-options">
                    <button
                      type="button"
                      className={`radius-chip ${competitorDisplayMode === "point" ? "active" : ""}`}
                      onClick={() => handleCompetitorDisplayModeChange("point")}
                    >
                      点状
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${competitorDisplayMode === "circle" && competitorRadius === 100 ? "active" : ""}`}
                      onClick={() => {
                        handleCompetitorDisplayModeChange("circle");
                        handleCompetitorRadiusChange(100);
                      }}
                    >
                      100m
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${competitorDisplayMode === "circle" && competitorRadius === 300 ? "active" : ""}`}
                      onClick={() => {
                        handleCompetitorDisplayModeChange("circle");
                        handleCompetitorRadiusChange(300);
                      }}
                    >
                      300m
                    </button>
                    <button
                      type="button"
                      className={`radius-chip ${competitorDisplayMode === "circle" && competitorRadius === 500 ? "active" : ""}`}
                      onClick={() => {
                        handleCompetitorDisplayModeChange("circle");
                        handleCompetitorRadiusChange(500);
                      }}
                    >
                      500m
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span>当前竞品：</span>
                    {competitorCounts.length > 0 ? (
                      competitorCounts.map((item) => (
                        <span key={item.keyword} style={{ color: "#0f172a" }}>
                          {item.keyword} · {item.count} 家
                        </span>
                      ))
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      
      <div className="slide-panel-footer">
        <div className="footer-actions">
          <button className="secondary" type="button" onClick={toggleAdmin}>
            POI管理
          </button>
          <button className="primary" onClick={handleGenerate} disabled={mutation.isLoading}>
            {mutation.isLoading ? "计算中..." : "生成分析"}
          </button>
        </div>
      </div>
    </div>
  );
}