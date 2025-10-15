import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  searchPlanningPois,
  type PlanningPoint,
  type PlanningPointPayload,
  type PlanningPointUpdatePayload,
  type PlanningPoiSuggestion,
} from "../services/api";
import { usePlanningPoints } from "../hooks/usePlanningPoints";
import { usePoiStore } from "../store/usePoiStore";
import { PLANNING_COLOR_OPTIONS } from "../data/planningColors";

const DEFAULT_RADIUS = 1000;

type FormMode = "create" | "edit";

export function PlanningManager(): JSX.Element {
  const {
    city,
    planningDraft,
    setPlanningDraft,
    awaitingPlanningMapClick,
    setAwaitingPlanningMapClick,
    selectedPlanningPointId,
    setSelectedPlanningPoint,
  } = usePoiStore();
  const { points, isLoading, createMutation, updateMutation, deleteMutation } = usePlanningPoints();
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<PlanningPoiSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasDraftCenter = Boolean(planningDraft?.center);

  useEffect(() => {
    if (planningDraft?.center && errorMessage) {
      setErrorMessage(null);
    }
  }, [planningDraft?.center, errorMessage]);

  const handleStartCreate = useCallback(
    (source: "search" | "map") => {
      setFormMode("create");
      setErrorMessage(null);
      setSelectedSuggestionId(null);
      setSearchKeyword("");
      setSearchResults([]);
      setSelectedPlanningPoint(null);
      setPlanningDraft({
        id: undefined,
        city,
        source,
        name: source === "map" ? `候选点${points.length + 1}` : "",
        radiusMeters: DEFAULT_RADIUS,
        color: PLANNING_COLOR_OPTIONS[0]?.value ?? "#22c55e",
      });
      setAwaitingPlanningMapClick(source === "map");
    },
    [
      city,
      points.length,
      setAwaitingPlanningMapClick,
      setPlanningDraft,
      setSelectedPlanningPoint,
    ]
  );

  const handleEdit = useCallback(
    (point: PlanningPoint) => {
      setFormMode("edit");
      setErrorMessage(null);
      setSelectedSuggestionId(null);
      setSearchResults([]);
      setAwaitingPlanningMapClick(false);
      setPlanningDraft({
        id: point.id,
        city: point.city,
        source: "search",
        name: point.name,
        radiusMeters: point.radiusMeters,
        color: point.color,
        center: { lng: point.longitude, lat: point.latitude },
      });
      setSelectedPlanningPoint(point.id);
    },
    [setAwaitingPlanningMapClick, setPlanningDraft, setSelectedPlanningPoint]
  );

  const handleCancel = useCallback(() => {
    setFormMode(null);
    setPlanningDraft(null);
    setAwaitingPlanningMapClick(false);
    setSearchKeyword("");
    setSearchResults([]);
    setSelectedSuggestionId(null);
    setErrorMessage(null);
  }, [setAwaitingPlanningMapClick, setPlanningDraft]);

  const handleSearch = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (!planningDraft) {
        return;
      }
      const keyword = searchKeyword.trim();
      if (!keyword) {
        setErrorMessage("请输入关键词后再搜索");
        return;
      }
      setIsSearching(true);
      setErrorMessage(null);
      try {
        const results = await searchPlanningPois({ city: planningDraft.city, keyword });
        setSearchResults(results);
        if (results.length === 0) {
          setErrorMessage("未找到匹配的 POI，请尝试其他关键词");
        }
      } catch (error) {
        setErrorMessage((error as Error).message ?? "搜索失败，请稍后再试");
      } finally {
        setIsSearching(false);
      }
    },
    [planningDraft, searchKeyword]
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: PlanningPoiSuggestion) => {
      if (!planningDraft) {
        return;
      }
      setSelectedSuggestionId(suggestion.id);
      setPlanningDraft({
        ...planningDraft,
        name: planningDraft.name || suggestion.name || "规划点",
        center: {
          lng: suggestion.longitude,
          lat: suggestion.latitude,
        },
        city: suggestion.city || planningDraft.city,
      });
    },
    [planningDraft, setPlanningDraft]
  );

  const handleNameChange = (name: string) => {
    if (!planningDraft) return;
    setPlanningDraft({ ...planningDraft, name });
  };

  const handleRadiusChange = (radius: number) => {
    if (!planningDraft) return;
    setPlanningDraft({ ...planningDraft, radiusMeters: radius });
  };

  const handleColorChange = (color: string) => {
    if (!planningDraft) return;
    setPlanningDraft({ ...planningDraft, color });
  };

  const handleSave = useCallback(() => {
    if (!planningDraft) {
      return;
    }

    if (!planningDraft.name.trim()) {
      setErrorMessage("请填写规划点名称");
      return;
    }

    if (!planningDraft.center) {
      setErrorMessage("请选择规划点坐标");
      return;
    }

    setErrorMessage(null);

    if (formMode === "create") {
      const payload: PlanningPointPayload = {
        city: planningDraft.city,
        name: planningDraft.name.trim(),
        radiusMeters: planningDraft.radiusMeters,
        color: planningDraft.color,
        center: planningDraft.center,
      };
      createMutation.mutate(payload, {
        onSuccess: (record) => {
          setSelectedPlanningPoint(record.id);
          handleCancel();
        },
        onError: (error) => {
          setErrorMessage((error as Error).message ?? "新增失败，请稍后再试");
        },
      });
      return;
    }

    if (formMode === "edit" && planningDraft.id) {
      const payload: PlanningPointUpdatePayload = {
        city: planningDraft.city,
        name: planningDraft.name.trim(),
        radiusMeters: planningDraft.radiusMeters,
        color: planningDraft.color,
        center: planningDraft.center,
      };
      updateMutation.mutate(
        { id: planningDraft.id, payload },
        {
          onSuccess: (record) => {
            setSelectedPlanningPoint(record.id);
            handleCancel();
          },
          onError: (error) => {
            setErrorMessage((error as Error).message ?? "更新失败，请稍后再试");
          },
        }
      );
    }
  }, [
    createMutation,
    formMode,
    handleCancel,
    planningDraft,
    setSelectedPlanningPoint,
    updateMutation,
  ]);

  const handleDelete = useCallback(
    (point: PlanningPoint) => {
      const confirmDelete = window.confirm(`确定删除规划点「${point.name}」吗？`);
      if (!confirmDelete) return;
      deleteMutation.mutate(point.id, {
        onError: (error) => {
          setErrorMessage((error as Error).message ?? "删除失败，请稍后再试");
        },
        onSuccess: () => {
          if (selectedPlanningPointId === point.id) {
            setSelectedPlanningPoint(null);
          }
          if (planningDraft?.id === point.id) {
            handleCancel();
          }
        },
      });
    },
    [
      deleteMutation,
      handleCancel,
      planningDraft?.id,
      selectedPlanningPointId,
      setSelectedPlanningPoint,
    ]
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const actionLabel = useMemo(() => {
    if (!formMode) return "";
    return formMode === "create" ? "保存候选点" : "更新候选点";
  }, [formMode]);

  return (
    <div>
      <div className="layer-toggle">
        <span className="layer-title">选址规划圈</span>
        <div className={`toggle ${points.length > 0 ? "active" : ""}`} />
      </div>
      <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>
        支持以候选商圈的方式保存多个规划点，可基于关键词搜索或地图点选快速建立。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="secondary" type="button" onClick={() => handleStartCreate("search")}>
          关键词新增
        </button>
        <button className="secondary" type="button" onClick={() => handleStartCreate("map")}>
          地图点选
        </button>
      </div>
      {formMode && planningDraft ? (
        <div className="planning-form">
          <div className="planning-form__header">
            <strong>{formMode === "create" ? "新增候选点" : "编辑候选点"}</strong>
            <button type="button" onClick={handleCancel}>
              ✕
            </button>
          </div>
          {planningDraft.source === "search" && formMode === "create" && (
            <form className="planning-search" onSubmit={handleSearch}>
              <label>
                <span>搜索关键词</span>
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="输入地址或地标"
                />
              </label>
              <button className="secondary" type="submit" disabled={isSearching}>
                {isSearching ? "搜索中..." : "搜索 POI"}
              </button>
            </form>
          )}
          {planningDraft.source === "search" && formMode === "create" && (
            <div className="planning-search-results">
              {isSearching ? (
                <p className="planning-helper">正在搜索候选点...</p>
              ) : searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`planning-suggestion ${
                      selectedSuggestionId === item.id ? "active" : ""
                    }`}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <span className="planning-suggestion__name">{item.name}</span>
                    <span className="planning-suggestion__address">{item.address || "无详细地址"}</span>
                  </button>
                ))
              ) : (
                <p className="planning-helper">搜索结果会显示在这里</p>
              )}
            </div>
          )}
          {planningDraft.source === "map" && (
            <div className="planning-helper">
              {awaitingPlanningMapClick
                ? "请在地图上点击一个地点作为规划点中心。"
                : hasDraftCenter
                ? "已捕获地图点选坐标，可继续填写信息。"
                : "未捕获坐标，可点击“重新点选”再次拾取。"}
              {!awaitingPlanningMapClick && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setAwaitingPlanningMapClick(true);
                  }}
                >
                  重新点选
                </button>
              )}
            </div>
          )}
          <div className="planning-form__fields">
            <label>
              <span>名称</span>
              <input
                value={planningDraft.name}
                placeholder="如：世纪大道商圈候选"
                onChange={(event) => handleNameChange(event.target.value)}
              />
            </label>
            <label>
              <span>半径 (米)</span>
              <input
                type="number"
                min={100}
                max={5000}
                step={50}
                value={planningDraft.radiusMeters}
                onChange={(event) => handleRadiusChange(Number(event.target.value ?? DEFAULT_RADIUS))}
              />
            </label>
            <div className="planning-color-picker">
              <span>圈层颜色</span>
              <div>
                {PLANNING_COLOR_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`planning-color ${
                      planningDraft.color === option.value ? "selected" : ""
                    }`}
                    style={{ backgroundColor: option.value }}
                    onClick={() => handleColorChange(option.value)}
                    aria-label={option.label}
                  />
                ))}
              </div>
            </div>
            <div className="planning-coords">
              <span>坐标</span>
              <strong>
                {planningDraft.center
                  ? `${planningDraft.center.lng.toFixed(5)}, ${planningDraft.center.lat.toFixed(5)}`
                  : "尚未选择"}
              </strong>
            </div>
          </div>
          {errorMessage && <p className="planning-error">{errorMessage}</p>}
          <div className="planning-actions">
            <button
              className="primary"
              type="button"
              onClick={handleSave}
              disabled={isSaving || !planningDraft.center}
            >
              {isSaving ? "保存中…" : actionLabel}
            </button>
            <button className="secondary" type="button" onClick={handleCancel}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      <div className="planning-list">
        {isLoading ? (
          <p className="planning-helper">正在加载规划点...</p>
        ) : points.length === 0 ? (
          <p className="planning-helper">暂无规划点，可通过上方按钮新增。</p>
        ) : (
          points.map((point) => (
            <div
              key={point.id}
              className={`planning-item ${selectedPlanningPointId === point.id ? "active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPlanningPoint(point.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedPlanningPoint(point.id);
                }
              }}
            >
              <span className="planning-item__color" style={{ backgroundColor: point.color }} />
              <div className="planning-item__content">
                <strong>{point.name}</strong>
                <span>
                  半径 {point.radiusMeters}m · 坐标 {point.longitude.toFixed(4)}, {point.latitude.toFixed(4)}
                </span>
              </div>
              <div className="planning-item__actions">
                <button type="button" onClick={(event) => {
                  event.stopPropagation();
                  handleEdit(point);
                }}>
                  编辑
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(point);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
