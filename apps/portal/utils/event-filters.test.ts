import { describe, expect, it } from "vitest";
import type { RandomEvent } from "~/types/random-event";
import { commonEffectTags, emptyEventFilters, facetCount, groupEvents, matchesEvent, sortEvents, UNGROUPED } from "./event-filters";

const event = (eventId: string, overrides: Partial<RandomEvent> = {}): RandomEvent => ({ eventId, name: eventId, category: "增益", rarity: "R", description: "", durationSeconds: null, cooldownSeconds: null, weight: 1, gameVersion: "5.0", eventGroup: null, effectTags: [], effectAnnotations: [], releaseStatus: "implemented", archived: false, challenges: [], ...overrides });

const events = [
  event("a", { eventGroup: "赌徒", effectTags: ["心之钢", "永久"], category: "机制" }),
  event("b", { eventGroup: "赌徒", effectTags: ["心之钢"], rarity: "SR", category: "机制" }),
  event("c", { eventGroup: "作弊", effectTags: ["永久"], gameVersion: "4.0" }),
  event("d", { effectTags: ["心之钢"], gameVersion: "4.0", releaseStatus: "removed" }),
];

describe("event filters", () => {
  it("hides non-implemented events by default and combines groups as any-of and effects as all-of", () => {
    const filters = emptyEventFilters();
    expect(events.filter((item) => matchesEvent(item, filters)).map((item) => item.eventId)).toEqual(["a", "b", "c"]);
    expect(events.filter((item) => matchesEvent(item, { ...filters, groups: ["赌徒", "作弊"] })).map((item) => item.eventId)).toEqual(["a", "b", "c"]);
    expect(events.filter((item) => matchesEvent(item, { ...filters, tags: ["心之钢", "永久"] })).map((item) => item.eventId)).toEqual(["a"]);
    expect(events.filter((item) => matchesEvent(item, { ...filters, status: "all", tags: ["心之钢"] })).map((item) => item.eventId)).toEqual(["a", "b", "d"]);
  });

  it("searches names, descriptions, groups, and effects", () => {
    const filters = { ...emptyEventFilters(), query: "作弊" };
    expect(events.filter((item) => matchesEvent(item, filters)).map((item) => item.eventId)).toEqual(["c"]);
  });

  it("counts a chip against every other filter but its own facet", () => {
    const filters = { ...emptyEventFilters(), groups: ["赌徒"], tags: ["永久"] };
    // "作弊" is outside the selected group but still counts for the group facet; its own selection is ignored.
    expect(facetCount(events, filters, "groups", "作弊")).toBe(1);
    expect(facetCount(events, filters, "groups", "赌徒")).toBe(1);
    expect(facetCount(events, filters, "tags", "心之钢")).toBe(2);
  });

  it("lists the most common effects first", () => {
    expect(commonEffectTags(events, 1)).toEqual(["心之钢"]);
  });

  it("sorts by latest version, name, or probability", () => {
    const probability = (item: RandomEvent) => ({ a: 0.1, b: 0.3, c: null, d: 0.2 }[item.eventId] ?? null);
    expect(sortEvents(events, "latest", probability).map((item) => item.eventId)).toEqual(["a", "b", "c", "d"]);
    expect(sortEvents(events, "probability", probability).map((item) => item.eventId)).toEqual(["b", "d", "a", "c"]);
    expect(sortEvents([...events].reverse(), "name", probability).map((item) => item.eventId)).toEqual(["a", "b", "c", "d"]);
  });

  it("groups by event group with ungrouped last, or not at all", () => {
    expect(groupEvents(events, "none")).toHaveLength(1);
    expect(groupEvents(events, "group").map((group) => [group.label, group.events.length])).toEqual([["赌徒", 2], ["作弊", 1], [UNGROUPED, 1]]);
    expect(groupEvents(events, "version").map((group) => group.label)).toEqual(["5.0", "4.0"]);
  });
});
