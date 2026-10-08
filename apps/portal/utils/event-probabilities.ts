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

const validWeight = (weight: number | null): weight is number => weight !== null && Number.isFinite(weight) && weight >= 0;
const acceptance = (weight: number) => Math.min(1, weight / EVENT_WEIGHT_BASE);

// Events of a suspended version are left out of the next Bastion build, so they are not in the pool either.
const inPool = (event: RandomEvent, excludedVersions?: ReadonlySet<string>) => !event.archived && event.releaseStatus === "implemented" && !excludedVersions?.has(event.gameVersion);

function poolStats(events: RandomEvent[], excludedVersions?: ReadonlySet<string>) {
  const pool = events.filter((item) => inPool(item, excludedVersions));
  const weights = pool.map((item) => item.weight).filter(validWeight);
  const poolSize = pool.length;
  const poolTotalWeight = weights.length === poolSize ? weights.reduce((total, value) => total + value, 0) : null;
  const success = poolSize && poolTotalWeight !== null ? weights.reduce((total, weight) => total + acceptance(weight), 0) / poolSize : null;
  return { poolSize, poolTotalWeight, success };
}

function probabilityIn(stats: ReturnType<typeof poolStats>, weight: number): EventProbability {
  const { poolSize, poolTotalWeight, success } = stats;
  if (success === null) return { poolSize, poolTotalWeight, failureProbability: null, guaranteeProbability: null, appearanceProbability: null };
  const failureProbability = 1 - success;
  const guaranteeProbability = failureProbability ** EVENT_MAX_ATTEMPTS;
  const accepted = success === 0 ? 0 : (acceptance(weight) / poolSize) * (1 - guaranteeProbability) / success;
  return { poolSize, poolTotalWeight, failureProbability, guaranteeProbability, appearanceProbability: accepted + guaranteeProbability / poolSize };
}

export function calculateEventProbabilities(event: RandomEvent, events: RandomEvent[], excludedVersions?: ReadonlySet<string>): EventProbability {
  const stats = poolStats(events, excludedVersions);
  if (!inPool(event, excludedVersions) || !validWeight(event.weight)) return { poolSize: stats.poolSize, poolTotalWeight: stats.poolTotalWeight, failureProbability: null, guaranteeProbability: null, appearanceProbability: null };
  return probabilityIn(stats, event.weight);
}

// Appearance probability of every event in the pool, computed once for the whole list.
export function calculatePoolProbabilities(events: RandomEvent[], excludedVersions?: ReadonlySet<string>) {
  const stats = poolStats(events, excludedVersions);
  const result = new Map<string, number>();
  for (const event of events) {
    if (!inPool(event, excludedVersions) || !validWeight(event.weight)) continue;
    const probability = probabilityIn(stats, event.weight).appearanceProbability;
    if (probability !== null) result.set(event.eventId, probability);
  }
  return result;
}

export function formatProbability(value: number | null) {
  return value === null ? "暂无记录" : `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value * 100)}%`;
}
