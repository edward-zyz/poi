import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { suggestBrands } from "../data/baseBrands";
import { fetchBrandDensity } from "../services/api";
import { usePoiStore } from "../store/usePoiStore";
import { parseKeywords } from "../utils/keywords";

const CITY_OPTIONS = ["上海市", "北京市", "广州市", "深圳市", "杭州市", "成都市"];

export function TopBar(): JSX.Element {
  const {
    city,
    setCity,
    mainBrandInput,
    setMainBrandInput,
    competitorInput,
    setCompetitorInput,
    setDensityResult,
    setAnalysisResult,
    toggleAdmin,
  } = usePoiStore();

  const mutation = useMutation({
    mutationFn: fetchBrandDensity,
    onSuccess: (result) => {
      setDensityResult(result);
      setAnalysisResult(null);
      if (typeof window !== "undefined") {
        (window as any).lastDensityResult = result;
      }
      // eslint-disable-next-line no-console
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

  return (
    <div className="topbar">
      <div className="brand">
        <span>Location Scout MVP</span>
        <h1>门店选址辅助工具</h1>
      </div>
      <div className="controls">
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
            placeholder="如：喜茶"
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
        <button className="secondary" type="button" onClick={toggleAdmin}>
          POI管理
        </button>
        <button className="primary" onClick={handleGenerate} disabled={mutation.isLoading}>
          {mutation.isLoading ? "计算中..." : "生成分析"}
        </button>
      </div>
    </div>
  );
}
