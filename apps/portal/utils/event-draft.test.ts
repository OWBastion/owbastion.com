import { describe, expect, it } from "vitest";
import type { RandomEvent } from "~/types/random-event";
import { applyDraft, draftToUpdates, stage, undoUpdates } from "./event-draft";
import { calculateEventProbabilities, calculatePoolProbabilities } from "./event-probabilities";

const event = (eventId: string, overrides: Partial<RandomEvent> = {}): RandomEvent => ({ eventId, name: eventId, category: "增益", rarity: "R", description: "", durationSeconds: null, cooldownSeconds: null, weight: 1, gameVersion: "5.0", eventGroup: null, effectTags: [], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [], ...overrides });
const a = event("a", { eventGroup: "赌徒" });
const b = event("b");

describe("event draft", () => {
  it("stages changes and drops one that returns to the saved value", () => {
    let draft = stage(new Map(), a, { weight: 2 });
    draft = stage(draft, a, { eventGroup: "作弊" });
    expect([...draft.get("a")!.weight ? Object.keys(draft.get("a")!) : []]).toEqual(["weight", "eventGroup"]);
    draft = stage(draft, a, { weight: 1 });
    expect(draft.get("a")).toEqual({ eventGroup: "作弊" });
    draft = stage(draft, a, { eventGroup: "赌徒" });
    expect(draft.size).toBe(0);
  });

  it("treats an empty group and no group as the same", () => {
    expect(stage(new Map(), b, { eventGroup: null }).size).toBe(0);
    expect(stage(new Map(), a, { eventGroup: null }).get("a")).toEqual({ eventGroup: null });
  });

  it("applies the draft over the saved events without touching them", () => {
    const draft = stage(new Map(), a, { weight: 3 });
    expect(applyDraft([a, b], draft).map((item) => item.weight)).toEqual([3, 1]);
    expect(a.weight).toBe(1);
  });

  it("builds the save request with cleared groups as empty strings, and the matching undo", () => {
    let draft = stage(new Map(), a, { eventGroup: null, weight: 0.5 });
    draft = stage(draft, b, { releaseStatus: "removed" });
    expect(draftToUpdates(draft)).toEqual([{ eventId: "a", eventGroup: "", weight: 0.5 }, { eventId: "b", releaseStatus: "removed" }]);
    expect(undoUpdates([a, b], draft)).toEqual([{ eventId: "a", eventGroup: "赌徒", weight: 1 }, { eventId: "b", releaseStatus: "implemented" }]);
  });
});

describe("pool probabilities", () => {
  it("matches the per-event calculation and sums to one", () => {
    const events = [event("a", { weight: 2.5 }), event("b", { weight: 1.25 }), event("c", { weight: 0.5 })];
    const all = calculatePoolProbabilities(events);
    for (const item of events) expect(all.get(item.eventId)).toBeCloseTo(calculateEventProbabilities(item, events).appearanceProbability!);
    expect([...all.values()].reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("leaves events of a suspended version out of the pool", () => {
    const events = [event("a", { gameVersion: "5.0" }), event("b", { gameVersion: "4.0" })];
    const all = calculatePoolProbabilities(events, new Set(["4.0"]));
    expect(all.has("b")).toBe(false);
    expect(all.get("a")).toBeCloseTo(1);
  });
});
