import { describe, expect, it } from "vitest";
import { calculateEventProbabilities } from "~/utils/event-probabilities";
import type { RandomEvent } from "~/types/random-event";

const event = (eventId: string, weight: number | null, overrides: Partial<RandomEvent> = {}): RandomEvent => ({ eventId, name: eventId, category: "机制", rarity: "R", description: "", durationSeconds: 1, cooldownSeconds: 0.32, weight, gameVersion: "5.0", effectTags: [], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [], ...overrides });

describe("event probabilities", () => {
  it("draws from one global pool regardless of category", () => {
    const events = [event("a", 0.7, { category: "增益" }), event("b", 1, { category: "减益" }), event("c", 1.2)];
    const result = calculateEventProbabilities(events[0], events);
    expect(result.poolSize).toBe(3);
    expect(result.poolTotalWeight).toBeCloseTo(2.9);
    expect(result.failureProbability).toBeCloseTo(1 - 2.9 / 7.5);
    expect(result.guaranteeProbability).toBeCloseTo(result.failureProbability! ** 8);
  });

  it("matches a hand-computed pool and the probabilities of the pool sum to one", () => {
    const events = [event("a", 2.5), event("b", 1.25), event("c", 0)];
    const [a, b, c] = events.map((item) => calculateEventProbabilities(item, events).appearanceProbability!);
    const success = (1 + 0.5 + 0) / 3;
    const guarantee = (1 - success) ** 8;
    expect(a).toBeCloseTo((1 / 3) * (1 - guarantee) / success + guarantee / 3);
    expect(b).toBeCloseTo((0.5 / 3) * (1 - guarantee) / success + guarantee / 3);
    expect(c).toBeCloseTo(guarantee / 3);
    expect(a + b + c).toBeCloseTo(1);
  });

  it("caps a weight above the acceptance bound and still sums to one", () => {
    const events = [event("a", 5), event("b", 1)];
    const results = events.map((item) => calculateEventProbabilities(item, events).appearanceProbability!);
    expect(results[0]).toBeGreaterThan(results[1]);
    expect(results[0] + results[1]).toBeCloseTo(1);
    expect(calculateEventProbabilities(events[0], events).failureProbability).toBeCloseTo(1 - (1 + 0.4) / 2);
  });

  it("falls back to a uniform draw when every weight is zero", () => {
    const events = [event("a", 0), event("b", 0)];
    expect(calculateEventProbabilities(events[0], events).appearanceProbability).toBeCloseTo(0.5);
  });

  it("only counts implemented, non-archived events in the pool", () => {
    const events = [event("a", 1), event("dev", 1, { releaseStatus: "development" }), event("old", 1, { releaseStatus: "removed" }), event("gone", 1, { archived: true })];
    expect(calculateEventProbabilities(events[0], events).poolSize).toBe(1);
    for (const outsider of events.slice(1)) expect(calculateEventProbabilities(outsider, events).appearanceProbability).toBeNull();
  });

  it("does not compute a probability when a pool weight is missing", () => {
    const events = [event("a", 0.7), event("b", null)];
    expect(calculateEventProbabilities(events[0], events).appearanceProbability).toBeNull();
  });
});
