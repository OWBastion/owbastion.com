import type { RandomEvent } from "~/types/random-event";

// Mirrors Bastion's rejection sampling over one global pool (docs/modules/03-events-system.md):
// each round draws a candidate uniformly and accepts it with probability weight / EVENT_WEIGHT_BASE,
// for at most EVENT_MAX_ATTEMPTS rounds, then keeps the last candidate.
export const EVENT_WEIGHT_BASE = 2.5;
export const EVENT_MAX_ATTEMPTS = 8;

export type EventProbability = {
  poolSize: number;
  poolTotalWeight: number | null;
  failureProbability: number | null;
  guaranteeProbability: number | null;
  appearanceProbability: number | null;
};

const inPool = (event: RandomEvent) => !event.archived && event.releaseStatus === "implemented";
const validWeight = (weight: number | null): weight is number => weight !== null && Number.isFinite(weight) && weight >= 0;

export function calculateEventProbabilities(event: RandomEvent, events: RandomEvent[]): EventProbability {
  const pool = events.filter(inPool);
  const poolSize = pool.length;
  const weights = pool.map((item) => item.weight).filter(validWeight);
  const poolTotalWeight = weights.length === poolSize ? weights.reduce((total, value) => total + value, 0) : null;
  const unknown = { poolSize, poolTotalWeight, failureProbability: null, guaranteeProbability: null, appearanceProbability: null };
  if (!inPool(event) || poolSize === 0 || poolTotalWeight === null || !validWeight(event.weight)) return unknown;

  const acceptance = (weight: number) => Math.min(1, weight / EVENT_WEIGHT_BASE);
  const singleAttemptSuccess = weights.reduce((total, weight) => total + acceptance(weight), 0) / poolSize;
  const failureProbability = 1 - singleAttemptSuccess;
  const guaranteeProbability = failureProbability ** EVENT_MAX_ATTEMPTS;
  const acceptedAppearance = singleAttemptSuccess === 0 ? 0 : (acceptance(event.weight) / poolSize) * (1 - guaranteeProbability) / singleAttemptSuccess;
  return { poolSize, poolTotalWeight, failureProbability, guaranteeProbability, appearanceProbability: acceptedAppearance + guaranteeProbability / poolSize };
}

export function formatProbability(value: number | null) {
  return value === null ? "暂无记录" : `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}
