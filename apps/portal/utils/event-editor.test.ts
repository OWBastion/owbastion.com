import { describe, expect, it } from "vitest";
import type { RandomEvent } from "~/types/random-event";
import { bodyFromEvent, bodyFromForm, emptyEventForm, formFromEvent, isFormDirty } from "./event-editor";

const event: RandomEvent = { eventId: "e1", name: "梭哈", category: "机制", rarity: "SR", description: "说明", durationSeconds: 15, cooldownSeconds: null, weight: 0.7, gameVersion: "5.0", eventGroup: "赌徒", effectTags: ["心之钢"], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [{ challengeId: "c1", family: "map", gameplayRevisionId: "r1", name: "地图挑战" }, { challengeId: "c2", family: "achievement", titleName: "称号" }] };

describe("event editor mapping", () => {
  it("round-trips an event into its write body and keeps challenge links", () => {
    expect(bodyFromEvent(event)).toEqual({ contractVersion: "1", name: "梭哈", category: "机制", eventGroup: "赌徒", description: "说明", durationSeconds: 15, cooldownSeconds: null, weight: 0.7, gameVersion: "5.0", effectTags: ["心之钢"], releaseStatus: "implemented", challengeLinks: [{ family: "map", challengeId: "c1" }, { family: "achievement", challengeId: "c2" }] });
  });

  it("sends an empty group as an empty string so the server clears it", () => {
    expect(bodyFromEvent({ ...event, eventGroup: null }).eventGroup).toBe("");
    expect(bodyFromForm({ ...emptyEventForm(), eventGroup: "  赌徒 " }).eventGroup).toBe("赌徒");
  });

  it("is dirty only when a written value changes", () => {
    const baseline = formFromEvent(event);
    expect(isFormDirty({ ...baseline }, baseline)).toBe(false);
    expect(isFormDirty({ ...baseline, effectTags: [" 心之钢 "] }, baseline)).toBe(false);
    expect(isFormDirty({ ...baseline, weight: 0.8 }, baseline)).toBe(true);
    expect(isFormDirty({ ...baseline, eventGroup: "" }, baseline)).toBe(true);
  });
});
