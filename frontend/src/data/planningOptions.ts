import type { PlanningPoint } from "../services/api";

export interface PlanningStatusOption {
  value: PlanningPoint["status"];
  label: string;
  description: string;
  color: string;
}

export interface PlanningPriorityOption {
  value: number;
  label: string;
  hint?: string;
}

export const PLANNING_STATUS_OPTIONS: PlanningStatusOption[] = [
  {
    value: "pending",
    label: "待考察",
    description: "基础信息已补全，待线下踩点或验证周边指标。",
    color: "#f59e0b", // 橙色，与门店颜色区分
  },
  {
    value: "priority",
    label: "重点跟进",
    description: "关键条件已满足，进入签约/复核流程。",
    color: "#8b5cf6", // 紫色，与门店颜色区分
  },
  {
    value: "dropped",
    label: "淘汰",
    description: "条件不符或资源冲突，保留备查但默认隐藏在地图上。",
    color: "#94a3b8", // 保持灰色
  },
];

export const PLANNING_PRIORITY_OPTIONS: PlanningPriorityOption[] = [
  {
    value: 100,
    label: "主推（优先签约）",
    hint: "各项条件匹配目标客群，可优先推进。",
  },
  {
    value: 400,
    label: "备选（持续跟进）",
    hint: "核心条件尚待确认，作为备选或谈判筹码。",
  },
  {
    value: 800,
    label: "观察（信息待补充）",
    hint: "仅做记录，未来可重启评估。",
  },
];

const STATUS_META_MAP: Record<PlanningPoint["status"], PlanningStatusOption> =
  PLANNING_STATUS_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option;
    return acc;
  }, {} as Record<PlanningPoint["status"], PlanningStatusOption>);

export function getPlanningStatusMeta(
  status: PlanningPoint["status"] | undefined
): PlanningStatusOption {
  if (!status) {
    return STATUS_META_MAP.pending;
  }
  return STATUS_META_MAP[status] ?? STATUS_META_MAP.pending;
}

export function getPlanningPriorityOption(value: number | undefined): PlanningPriorityOption {
  const matched =
    PLANNING_PRIORITY_OPTIONS.find((option) => option.value === value) ??
    PLANNING_PRIORITY_OPTIONS[1];
  return matched;
}
