import { describe, expect, it } from "vitest";
import { calculateEventProbabilities } from "~/utils/event-probabilities";
import type { RandomEvent } from "~/types/random-event";

const event = (eventId: string, category: string, weight: number): RandomEvent => ({ eventId, name: eventId, category, rarity: "R", description: "", durationSeconds: 1, cooldownSeconds: 0.32, weight, gameVersion: "5.0", effectTags: [], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [] });

describe("event probabilities", () => {
  it("derives all probability fields from the current same-category group", () => {
    const events = [event("a", "机制", 0.7), event("b", "机制", 1), event("c", "机制", 1.2)];
    const result = calculateEventProbabilities(events[0], events);
    expect(result.categoryProbability).toBe(0.2);
    expect(result.groupTotalWeight).toBeCloseTo(2.9);
    expect(result.groupSize).toBe(3);
    expect(result.failureProbability).toBeCloseTo(1 - 2.9 / 7.5);
    expect(result.guaranteeProbability).toBeCloseTo(result.failureProbability! ** 8);
    expect(result.globalAppearanceProbability).toBeCloseTo(result.appearanceProbability! * 0.2);
  });

  it("does not compute a probability when a same-category weight is missing", () => {
    const events = [event("a", "机制", 0.7), { ...event("b", "机制", 1), weight: null }];
    expect(calculateEventProbabilities(events[0], events).appearanceProbability).toBeNull();
  });
});
