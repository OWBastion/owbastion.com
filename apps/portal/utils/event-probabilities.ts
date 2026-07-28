import type { RandomEvent } from "~/types/random-event";

export const EVENT_WEIGHT_BASE = 2.5;
export const EVENT_MAX_ATTEMPTS = 8;

const categoryProbabilities: Record<string, number> = {
  "增益": 0.425,
  "减益": 0.375,
  "机制": 0.2,
};

export type EventProbability = {
  categoryProbability: number | null;
  groupTotalWeight: number | null;
  groupSize: number;
  failureProbability: number | null;
  guaranteeProbability: number | null;
  appearanceProbability: number | null;
  globalAppearanceProbability: number | null;
};

const usableEvents = (events: RandomEvent[]) => events.filter((event) => !event.archived && event.releaseStatus !== "removed");

export function calculateEventProbabilities(event: RandomEvent, events: RandomEvent[]): EventProbability {
  const categoryProbability = categoryProbabilities[event.category] ?? null;
  const group = usableEvents(events).filter((item) => item.category === event.category);
  const weights = group.map((item) => item.weight).filter((weight): weight is number => weight !== null && Number.isFinite(weight) && weight >= 0);
  const weight = event.weight;
  const groupTotalWeight = weights.length === group.length ? weights.reduce((total, value) => total + value, 0) : null;
  const groupSize = group.length;
  if (groupSize === 0 || groupTotalWeight === null || weight === null || !Number.isFinite(weight) || weight < 0) {
    return { categoryProbability, groupTotalWeight, groupSize, failureProbability: null, guaranteeProbability: null, appearanceProbability: null, globalAppearanceProbability: null };
  }

  const singleAttemptSuccess = Math.min(1, groupTotalWeight / (groupSize * EVENT_WEIGHT_BASE));
  const failureProbability = 1 - singleAttemptSuccess;
  const guaranteeProbability = failureProbability ** EVENT_MAX_ATTEMPTS;
  const acceptedAppearance = groupSize * EVENT_WEIGHT_BASE === 0
    ? 0
    : (weight / (groupSize * EVENT_WEIGHT_BASE)) * (1 - guaranteeProbability) / (1 - failureProbability || 1);
  const appearanceProbability = acceptedAppearance + guaranteeProbability / groupSize;
  const globalAppearanceProbability = categoryProbability === null ? null : categoryProbability * appearanceProbability;
  return { categoryProbability, groupTotalWeight, groupSize, failureProbability, guaranteeProbability, appearanceProbability, globalAppearanceProbability };
}

export function formatProbability(value: number | null) {
  return value === null ? "暂无记录" : `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}
