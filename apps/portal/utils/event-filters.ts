import type { RandomEvent } from "~/types/random-event";

export type EventFilters = {
  query: string;
  status: RandomEvent["releaseStatus"] | "all";
  version: string;
  groups: string[];
  tags: string[];
  categories: string[];
  rarities: string[];
};
export type EventFacet = "groups" | "tags" | "categories" | "rarities";
export type EventSort = "latest" | "name" | "probability";
export type EventGrouping = "none" | "group" | "version" | "category";

export const UNGROUPED = "未分组";
export const emptyEventFilters = (): EventFilters => ({ query: "", status: "implemented", version: "all", groups: [], tags: [], categories: [], rarities: [] });

// Groups, categories and rarities combine as "any of"; selected effects must all be present.
export function matchesEvent(event: RandomEvent, filters: EventFilters, skip?: EventFacet) {
  const query = filters.query.trim();
  return (filters.status === "all" || event.releaseStatus === filters.status)
    && (filters.version === "all" || event.gameVersion === filters.version)
    && (skip === "groups" || !filters.groups.length || (event.eventGroup !== null && filters.groups.includes(event.eventGroup)))
    && (skip === "categories" || !filters.categories.length || filters.categories.includes(event.category))
    && (skip === "rarities" || !filters.rarities.length || filters.rarities.includes(event.rarity))
    && (skip === "tags" || filters.tags.every((tag) => event.effectTags.includes(tag)))
    && (!query || [event.name, event.description, event.eventGroup ?? "", ...event.effectTags].some((value) => value.includes(query)));
}

const facetValues = (event: RandomEvent, facet: EventFacet) => facet === "groups" ? (event.eventGroup ? [event.eventGroup] : []) : facet === "tags" ? event.effectTags : facet === "categories" ? [event.category] : event.rarity ? [event.rarity] : [];

// How many events a chip would show, given every other active filter.
export const facetCount = (events: RandomEvent[], filters: EventFilters, facet: EventFacet, value: string) =>
  events.filter((event) => matchesEvent(event, filters, facet) && facetValues(event, facet).includes(value)).length;

export function facetOptions(events: RandomEvent[], facet: EventFacet) {
  const counts = new Map<string, number>();
  for (const event of events) for (const value of new Set(facetValues(event, facet))) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN")).map(([value]) => value);
}

export const commonEffectTags = (events: RandomEvent[], limit = 6) => facetOptions(events, "tags").slice(0, limit);

const versionOrder = (left: string, right: string) => right.localeCompare(left, undefined, { numeric: true });

export function sortEvents(events: RandomEvent[], sort: EventSort, probabilityOf: (event: RandomEvent) => number | null) {
  const byName = (left: RandomEvent, right: RandomEvent) => left.name.localeCompare(right.name, "zh-CN");
  const compare = sort === "name" ? byName
    : sort === "probability" ? (left: RandomEvent, right: RandomEvent) => (probabilityOf(right) ?? -1) - (probabilityOf(left) ?? -1) || byName(left, right)
      : (left: RandomEvent, right: RandomEvent) => versionOrder(left.gameVersion, right.gameVersion) || byName(left, right);
  return [...events].sort(compare);
}

export function groupEvents(events: RandomEvent[], grouping: EventGrouping) {
  if (grouping === "none") return [{ key: "all", label: "", events }];
  const keyOf = (event: RandomEvent) => grouping === "group" ? event.eventGroup ?? UNGROUPED : grouping === "version" ? event.gameVersion : event.category;
  const groups = new Map<string, RandomEvent[]>();
  for (const event of events) groups.set(keyOf(event), [...(groups.get(keyOf(event)) ?? []), event]);
  return [...groups.entries()]
    .sort(([left], [right]) => grouping === "version" ? versionOrder(left, right) : Number(left === UNGROUPED) - Number(right === UNGROUPED) || left.localeCompare(right, "zh-CN"))
    .map(([label, items]) => ({ key: label, label, events: items }));
}
