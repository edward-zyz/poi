import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  searchPlanningPois,
  type PlanningPoint,
  type PlanningPointPayload,
  type PlanningPointUpdatePayload,
  type PlanningPoiSuggestion,
} from "../services/api";
import { usePlanningPoints } from "../hooks/usePlanningPoints";
import { usePoiStore } from "../store/usePoiStore";
import {
  PLANNING_STATUS_OPTIONS,
  PLANNING_PRIORITY_OPTIONS,
  getPlanningStatusMeta,
  getPlanningPriorityOption,
} from "../data/planningOptions";

const DEFAULT_RADIUS = 1000;
const AUTOSAVE_DELAY_MS = 1000;
const DEFAULT_PRIORITY_RANK =
  PLANNING_PRIORITY_OPTIONS[1]?.value ?? PLANNING_PRIORITY_OPTIONS[0]?.value ?? 400;

type FormMode = "create" | "edit";
type StatusFilter = PlanningPoint["status"] | "all";

function formatRelativeTime(timestampSeconds: number): string {
  if (!timestampSeconds) {
    return "未知";
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, nowSeconds - timestampSeconds);
  if (diff < 60) {
    return "刚刚";
  }
  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return `${minutes} 分钟前`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} 小时前`;
  }
  const days = Math.floor(diff / 86400);
  if (days < 30) {
    return `${days} 天前`;
  }
  const date = new Date(timestampSeconds * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function clampRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_RADIUS;
  }
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, 100), 2000);
}

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
  const { points, isLoading, createPoint, updatePoint, deletePoint } = usePlanningPoints();

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<PlanningPoiSuggestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listKeyword, setListKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [autoSaveMessage, setAutoSaveMessage] = useState<string | null>(null);

  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveMessageTimerRef = useRef<number | null>(null);
  const lastAutoSaveSnapshotRef = useRef<string>("");
  const pendingSnapshotRef = useRef<string | null>(null);

  const hasDraftCenter = Boolean(planningDraft?.center);
  const statusMeta = useMemo(
    () => getPlanningStatusMeta(planningDraft?.status),
    [planningDraft?.status]
  );

  const filteredPoints = useMemo(() => {
    const keyword = listKeyword.trim().toLowerCase();
    const filtered = points.filter((point) => {
      const statusMatched = statusFilter === "all" ? true : point.status === statusFilter;
      if (!statusMatched) return false;
      if (!keyword) return true;
      const name = point.name?.toLowerCase() ?? "";
      const notes = point.notes?.toLowerCase() ?? "";
      return name.includes(keyword) || notes.includes(keyword);
    });
    const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
  }, [points, listKeyword, statusFilter]);

  useEffect(() => {
    if (planningDraft?.center && errorMessage) {
      setErrorMessage(null);
    }
  }, [planningDraft?.center, errorMessage]);

  // Sync formMode with planningDraft changes
  useEffect(() => {
    if (planningDraft && !formMode) {
      // When planningDraft is set externally and formMode is not set, determine formMode
      setFormMode(planningDraft.id ? "edit" : "create");
    } else if (!planningDraft && formMode) {
      // When planningDraft is cleared, reset formMode
      setFormMode(null);
    }
  }, [planningDraft, formMode]);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const clearAutoSaveMessageTimer = useCallback(() => {
    if (autoSaveMessageTimerRef.current) {
      window.clearTimeout(autoSaveMessageTimerRef.current);
      autoSaveMessageTimerRef.current = null;
    }
  }, []);

  const showAutoSaveMessage = useCallback(
    (message: string) => {
      setAutoSaveMessage(message);
      clearAutoSaveMessageTimer();
      autoSaveMessageTimerRef.current = window.setTimeout(() => {
        setAutoSaveMessage(null);
        autoSaveMessageTimerRef.current = null;
      }, 2000);
    },
    [clearAutoSaveMessageTimer]
  );

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      clearAutoSaveMessageTimer();
    };
  }, [clearAutoSaveMessageTimer, clearAutoSaveTimer]);

  const handleStartCreate = useCallback(
    (source: "search" | "map") => {
      const defaultStatusOption = PLANNING_STATUS_OPTIONS[0];
      const defaultPriorityOption =
        PLANNING_PRIORITY_OPTIONS[1] ?? PLANNING_PRIORITY_OPTIONS[0];
      const statusValue = defaultStatusOption?.value ?? "pending";
      const statusColor = defaultStatusOption?.color ?? "#22c55e";
      const priorityValue = defaultPriorityOption?.value ?? DEFAULT_PRIORITY_RANK;

      setFormMode("create");
      setErrorMessage(null);
      setSelectedSuggestionId(null);
      setSearchKeyword("");
      setSearchResults([]);
      setSelectedPlanningPoint(null);
      lastAutoSaveSnapshotRef.current = "";
      pendingSnapshotRef.current = null;

      setPlanningDraft({
        id: undefined,
        city,
        source,
        sourceType: source === "map" ? "manual" : "manual",
        name: source === "map" ? `候选点${points.length + 1}` : "",
        radiusMeters: DEFAULT_RADIUS,
        status: statusValue,
        colorToken: statusValue,
        color: statusColor,
        priorityRank: priorityValue,
        notes: "",
        center: undefined,
        sourcePoiId: null,
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
      setSearchKeyword("");
      setSearchResults([]);
      setAwaitingPlanningMapClick(false);
      setSelectedPlanningPoint(point.id);

      const draft = {
        id: point.id,
        city: point.city,
        source: point.sourceType === "manual" ? "map" : "search",
        sourceType: point.sourceType,
        name: point.name,
        radiusMeters: point.radiusMeters,
        status: point.status,
        colorToken: point.colorToken ?? point.status,
        color: point.color,
        priorityRank: point.priorityRank ?? DEFAULT_PRIORITY_RANK,
        notes: point.notes ?? "",
        center: { lng: point.longitude, lat: point.latitude },
        sourcePoiId: point.sourcePoiId ?? null,
      };

      setPlanningDraft(draft);

      lastAutoSaveSnapshotRef.current = JSON.stringify({
        city: draft.city,
        name: draft.name,
        radiusMeters: draft.radiusMeters,
        status: draft.status,
        colorToken: draft.colorToken,
        color: draft.color,
        priorityRank: draft.priorityRank,
        notes: draft.notes,
        center: draft.center,
        sourceType: draft.sourceType,
        sourcePoiId: draft.sourcePoiId,
      });
      pendingSnapshotRef.current = null;
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
    setAutoSaveMessage(null);
    clearAutoSaveTimer();
    clearAutoSaveMessageTimer();
    lastAutoSaveSnapshotRef.current = "";
    pendingSnapshotRef.current = null;
  }, [
    clearAutoSaveMessageTimer,
    clearAutoSaveTimer,
    setAwaitingPlanningMapClick,
    setPlanningDraft,
  ]);

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
        sourceType: "poi",
        sourcePoiId: suggestion.id,
      });
      setAwaitingPlanningMapClick(false);
    },
    [planningDraft, setAwaitingPlanningMapClick, setPlanningDraft]
  );

  const handleNameChange = (name: string) => {
    if (!planningDraft) return;
    setPlanningDraft({ ...planningDraft, name });
  };

  const handleRadiusChange = (radius: number) => {
    if (!planningDraft) return;
    setPlanningDraft({ ...planningDraft, radiusMeters: clampRadius(radius) });
  };

  const handleStatusChange = (status: PlanningPoint["status"]) => {
    if (!planningDraft) return;
    const meta = getPlanningStatusMeta(status);
    setPlanningDraft({
      ...planningDraft,
      status,
      colorToken: status,
      color: meta.color,
    });
  };

  const handlePriorityChange = (value: number) => {
    if (!planningDraft) return;
    setPlanningDraft({
      ...planningDraft,
      priorityRank: value,
    });
  };

  const handleNotesChange = (notes: string) => {
    if (!planningDraft) return;
    const limited = notes.length > 2000 ? notes.slice(0, 2000) : notes;
    setPlanningDraft({ ...planningDraft, notes: limited });
  };

  const handleSave = useCallback(async () => {
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
    setIsSaving(true);

    const base = {
      city: planningDraft.city,
      name: planningDraft.name.trim(),
      radiusMeters: planningDraft.radiusMeters,
      color: planningDraft.color,
      colorToken: planningDraft.colorToken,
      status: planningDraft.status,
      priorityRank: planningDraft.priorityRank,
      notes: planningDraft.notes.trim(),
      center: planningDraft.center,
      sourceType: planningDraft.sourceType === "poi" ? "poi" : "manual",
      sourcePoiId:
        planningDraft.sourceType === "poi" ? planningDraft.sourcePoiId ?? null : null,
    };

    try {
      if (formMode === "create") {
        const createPayload: PlanningPointPayload = { ...base };
        const record = await createPoint(createPayload);
        setSelectedPlanningPoint(record.id);
        handleCancel();
        return;
      }

      if (formMode === "edit" && planningDraft.id) {
        const updatePayload: PlanningPointUpdatePayload = { ...base };
        const record = await updatePoint({ id: planningDraft.id, payload: updatePayload });
        setSelectedPlanningPoint(record.id);
        handleCancel();
      }
    } catch (error) {
      setErrorMessage((error as Error).message ?? `${formMode === "create" ? "新增" : "更新"}失败，请稍后再试`);
    } finally {
      setIsSaving(false);
    }
  }, [
    createPoint,
    updatePoint,
    formMode,
    handleCancel,
    planningDraft,
    setSelectedPlanningPoint,
  ]);

  const handleDelete = useCallback(
    async (point: PlanningPoint) => {
      const statusLabel = getPlanningStatusMeta(point.status).label;
      const confirmDelete = window.confirm(
        `确定删除规划点「${point.name}」吗？当前状态：${statusLabel}。删除后不可恢复。`
      );
      if (!confirmDelete) return;
      
      try {
        await deletePoint(point.id);
        if (selectedPlanningPointId === point.id) {
          setSelectedPlanningPoint(null);
        }
        if (planningDraft?.id === point.id) {
          handleCancel();
        }
      } catch (error) {
        setErrorMessage((error as Error).message ?? "删除失败，请稍后再试");
      }
    },
    [
      deletePoint,
      handleCancel,
      planningDraft?.id,
      selectedPlanningPointId,
      setSelectedPlanningPoint,
    ]
  );

  useEffect(() => {
    if (formMode !== "edit" || !planningDraft || !planningDraft.id || !planningDraft.center) {
      pendingSnapshotRef.current = null;
      return;
    }

    if (isSaving) {
      return;
    }

    const snapshot = JSON.stringify({
      city: planningDraft.city,
      name: planningDraft.name.trim(),
      radiusMeters: planningDraft.radiusMeters,
      status: planningDraft.status,
      colorToken: planningDraft.colorToken,
      color: planningDraft.color,
      priorityRank: planningDraft.priorityRank,
      notes: planningDraft.notes.trim(),
      center: planningDraft.center,
      sourceType: planningDraft.sourceType,
      sourcePoiId:
        planningDraft.sourceType === "poi" ? planningDraft.sourcePoiId ?? null : null,
    });

    if (
      snapshot === lastAutoSaveSnapshotRef.current ||
      snapshot === pendingSnapshotRef.current
    ) {
      return;
    }

    clearAutoSaveTimer();
    pendingSnapshotRef.current = snapshot;

    autoSaveTimerRef.current = window.setTimeout(() => {
      if (!planningDraft.id || !planningDraft.center) {
        return;
      }
      const updatePayload: PlanningPointUpdatePayload = {
        city: planningDraft.city,
        name: planningDraft.name.trim(),
        radiusMeters: planningDraft.radiusMeters,
        color: planningDraft.color,
        colorToken: planningDraft.colorToken,
        status: planningDraft.status,
        priorityRank: planningDraft.priorityRank,
        notes: planningDraft.notes.trim(),
        center: planningDraft.center,
        sourceType: planningDraft.sourceType,
        sourcePoiId:
          planningDraft.sourceType === "poi" ? planningDraft.sourcePoiId ?? null : null,
      };
      updateMutation.mutate(
        { id: planningDraft.id, payload: updatePayload },
        {
          onSuccess: () => {
            lastAutoSaveSnapshotRef.current = snapshot;
            pendingSnapshotRef.current = null;
            showAutoSaveMessage("已自动保存");
          },
          onError: (error) => {
            setErrorMessage((error as Error).message ?? "自动保存失败，请稍后重试");
            pendingSnapshotRef.current = null;
          },
        }
      );
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearAutoSaveTimer();
    };
  }, [
    clearAutoSaveTimer,
    formMode,
    planningDraft,
    showAutoSaveMessage,
    isSaving,
  ]);

  
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
      <p className="planning-intro">
        支持以候选商圈的方式保存多个规划点，可基于关键词搜索或地图点选快速建立，并在右侧数据面板中实时对比。
      </p>
        <div className="planning-filter-bar">
        <input
          value={listKeyword}
          onChange={(event) => setListKeyword(event.target.value)}
          placeholder="搜索候选点名称或备注"
          className="planning-search-input"
        />
        <div className="planning-status-filter">
          <button
            type="button"
            className={statusFilter === "all" ? "active" : ""}
            onClick={() => setStatusFilter("all")}
          >
            全部
          </button>
          {PLANNING_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={statusFilter === option.value ? "active" : ""}
              style={{ borderColor: option.color }}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {formMode && planningDraft ? (
        <div className="planning-form">
          <div className="planning-form__header">
            <strong>{formMode === "create" ? "新增候选点" : "编辑候选点"}</strong>
            <button type="button" onClick={handleCancel}>
              ✕
            </button>
          </div>
          {planningDraft.source === "search" && formMode === "create" ? (
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
          ) : null}
          {planningDraft.source === "search" && formMode === "create" ? (
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
                    <span className="planning-suggestion__address">
                      {item.address || "无详细地址"}
                    </span>
                  </button>
                ))
              ) : (
                <p className="planning-helper">搜索结果会显示在这里</p>
              )}
            </div>
          ) : null}
          {planningDraft.source === "map" ? (
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
          ) : null}
          <div className="planning-form__fields">
            <label className="planning-field">
              <span>名称</span>
              <input
                value={planningDraft.name}
                placeholder="如：世纪大道商圈候选"
                onChange={(event) => handleNameChange(event.target.value)}
              />
            </label>
            <div className="planning-field">
              <span>状态</span>
              <div className="planning-status-select">
                {PLANNING_STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`planning-status-option ${
                      planningDraft.status === option.value ? "selected" : ""
                    }`}
                    style={
                      planningDraft.status === option.value
                        ? { borderColor: option.color, color: option.color }
                        : { borderColor: option.color }
                    }
                    onClick={() => handleStatusChange(option.value)}
                  >
                    <span
                      className="planning-status-dot"
                      style={{ backgroundColor: option.color }}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="planning-status-hint">{statusMeta.description}</p>
            </div>
            <div className="planning-form__grid">
              <label className="planning-field">
                <span>半径 (米)</span>
                <input
                  type="number"
                  min={100}
                  max={2000}
                  step={50}
                  value={planningDraft.radiusMeters}
                  onChange={(event) => handleRadiusChange(Number(event.target.value ?? DEFAULT_RADIUS))}
                />
              </label>
              <label className="planning-field">
                <span>优先级</span>
                <select
                  value={planningDraft.priorityRank}
                  onChange={(event) => handlePriorityChange(Number(event.target.value))}
                >
                  {PLANNING_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="planning-field__hint">
                  {getPlanningPriorityOption(planningDraft.priorityRank).hint}
                </span>
              </label>
            </div>
            <label className="planning-field">
              <span>备注</span>
              <textarea
                value={planningDraft.notes}
                placeholder="补充现场踩点结论、楼层、租金等信息"
                onChange={(event) => handleNotesChange(event.target.value)}
              />
              <span className="planning-field__counter">{planningDraft.notes.length}/2000</span>
            </label>
            <div className="planning-coords">
              <span>坐标</span>
              <strong>
                {planningDraft.center
                  ? `${planningDraft.center.lng.toFixed(5)}, ${planningDraft.center.lat.toFixed(5)}`
                  : "尚未选择"}
              </strong>
            </div>
          </div>
          {autoSaveMessage && formMode === "edit" ? (
            <p className="planning-autosave">{autoSaveMessage}</p>
          ) : null}
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
        ) : filteredPoints.length === 0 ? (
          <p className="planning-helper">未找到匹配的规划点，可尝试调整筛选条件。</p>
        ) : (
          filteredPoints.map((point) => {
            const pointStatusMeta = getPlanningStatusMeta(point.status);
            const priorityOption = getPlanningPriorityOption(point.priorityRank);
            return (
              <div
                key={point.id}
                className={`planning-item ${selectedPlanningPointId === point.id ? "active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlanningPoint(point.id)}
                onMouseEnter={() => setSelectedPlanningPoint(point.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPlanningPoint(point.id);
                  }
                }}
              >
                  <div className="planning-item__body">
                  <div className="planning-item__header">
                    <span
                      className="planning-status-badge"
                      style={{ backgroundColor: pointStatusMeta.color }}
                    >
                      {pointStatusMeta.label}
                    </span>
                    <strong>{point.name}</strong>
                  </div>
                  <div className="planning-item__meta">
                    <span>半径 {point.radiusMeters}m</span>
                    <span>优先级：{priorityOption.label}</span>
                    <span>更新：{formatRelativeTime(point.updatedAt)}</span>
                    <span>
                      坐标 {point.longitude.toFixed(4)}, {point.latitude.toFixed(4)}
                    </span>
                  </div>
                  {point.notes ? (
                    <p className="planning-item__notes">{truncate(point.notes, 88)}</p>
                  ) : null}
                </div>
                <div className="planning-item__actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleEdit(point);
                    }}
                  >
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
            );
          })
        )}
      </div>
    </div>
  );
}
