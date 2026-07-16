<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";

type IndexedTitle = OwnedTitle & { order: number };
type TitleGroup = { name: string; titles: IndexedTitle[]; latestGrantedAt: number; order: number };

const props = defineProps<{ titles: OwnedTitle[] }>();

function sortTitles(titles: IndexedTitle[]) {
  return [...titles].sort((left, right) => right.grantedAt - left.grantedAt || left.order - right.order);
}

function groupTitles(titles: IndexedTitle[], nameFor: (title: IndexedTitle) => string) {
  const groups = new Map<string, IndexedTitle[]>();
  for (const title of titles) {
    const name = nameFor(title);
    groups.set(name, [...(groups.get(name) ?? []), title]);
  }
  return [...groups.entries()]
    .map(([name, groupedTitles]) => {
      const sortedTitles = sortTitles(groupedTitles);
      return { name, titles: sortedTitles, latestGrantedAt: sortedTitles[0]!.grantedAt, order: sortedTitles[0]!.order };
    })
    .sort((left, right) => right.latestGrantedAt - left.latestGrantedAt || left.order - right.order);
}

const indexedTitles = computed(() => props.titles.map((title, order) => ({ ...title, order })));
const mapGroups = computed(() => groupTitles(indexedTitles.value.filter((title) => title.scope === "map"), (title) => title.mapName ?? "地图称号"));
const globalGroups = computed(() => groupTitles(indexedTitles.value.filter((title) => title.scope === "global"), (title) => title.category));
const mapTitleCount = computed(() => mapGroups.value.reduce((count, group) => count + group.titles.length, 0));
const latestTitle = computed(() => sortTitles(indexedTitles.value)[0]);
const mapSectionOpen = computed(() => latestTitle.value?.scope === "map");
const openMapName = computed(() => mapSectionOpen.value ? latestTitle.value?.mapName ?? "地图称号" : undefined);
const openCategory = computed(() => latestTitle.value?.scope === "global" ? latestTitle.value.category : undefined);
</script>

<template>
  <div class="title-collection">
    <details v-if="mapGroups.length" class="title-group title-group-map" :open="mapSectionOpen">
      <summary class="title-group-summary" :aria-label="`地图称号，${mapTitleCount} 项称号`">
        <span class="title-group-label"><span class="title-group-kicker">地图专属</span><strong>地图称号</strong></span>
        <span class="title-group-count">{{ mapTitleCount }} 项</span>
      </summary>
      <div class="title-group-content map-groups">
        <details v-for="group in mapGroups" :key="group.name" class="map-group" :open="group.name === openMapName">
          <summary class="map-group-summary" :aria-label="`${group.name}，${group.titles.length} 项称号`">
            <strong>{{ group.name }}</strong><span>{{ group.titles.length }} 项</span>
          </summary>
          <div class="title-grid">
            <article v-for="title in group.titles" :key="title.grantId" class="title-card"><h3>{{ title.label }}</h3><p>{{ title.condition }}</p></article>
          </div>
        </details>
      </div>
    </details>

    <details v-for="group in globalGroups" :key="group.name" class="title-group" :open="group.name === openCategory">
      <summary class="title-group-summary" :aria-label="`${group.name}，${group.titles.length} 项称号`">
        <span class="title-group-label"><span class="title-group-kicker">通用称号</span><strong>{{ group.name }}</strong></span>
        <span class="title-group-count">{{ group.titles.length }} 项</span>
      </summary>
      <div class="title-group-content title-grid">
        <article v-for="title in group.titles" :key="title.grantId" class="title-card"><h3>{{ title.label }}</h3><p>{{ title.condition }}</p></article>
      </div>
    </details>
  </div>
</template>

<style scoped>
.title-collection { display: grid; gap: 12px; }
.title-group, .map-group { overflow: clip; border: 1px solid var(--line); border-radius: 16px; background: color-mix(in oklch, var(--surface-raised) 76%, var(--surface)); }
.title-group-summary, .map-group-summary { display: flex; align-items: center; justify-content: space-between; gap: 18px; cursor: pointer; list-style: none; user-select: none; }
.title-group-summary::-webkit-details-marker, .map-group-summary::-webkit-details-marker { display: none; }
.title-group-summary { min-height: 82px; padding: 17px 20px; }.title-group-summary::after, .map-group-summary::after { width: 8px; height: 8px; flex: 0 0 auto; margin-left: 4px; border-right: 1.5px solid var(--quiet); border-bottom: 1.5px solid var(--quiet); transform: rotate(45deg) translateY(-2px); transition: transform 160ms ease; content: ""; }.title-group[open] > .title-group-summary::after, .map-group[open] > .map-group-summary::after { transform: rotate(225deg) translate(-2px, -2px); }
.title-group-summary:focus-visible, .map-group-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }.title-group-summary:active, .map-group-summary:active { background: color-mix(in oklch, var(--accent-surface) 42%, transparent); }
.title-group-label { display: grid; min-width: 0; gap: 5px; }.title-group-kicker { color: var(--quiet); font-size: .68rem; font-weight: 700; letter-spacing: .06em; }.title-group-label strong, .map-group-summary strong { letter-spacing: -.025em; }.title-group-count, .map-group-summary span { margin-left: auto; color: var(--quiet); font-size: .78rem; white-space: nowrap; }
.title-group-content { padding: 0 20px 20px; }.map-groups { display: grid; gap: 10px; }.map-group { background: var(--surface); }.map-group-summary { min-height: 58px; padding: 12px 16px; }.map-group .title-grid { padding: 0 14px 14px; }
.title-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.title-card { display: grid; min-width: 0; min-height: 108px; align-content: start; gap: 8px; padding: 16px; border: 1px solid color-mix(in oklch, var(--line) 84%, var(--surface)); border-radius: 12px; background: color-mix(in oklch, var(--surface-raised) 72%, var(--surface)); }.title-card h3 { margin: 0; overflow-wrap: anywhere; color: var(--text); font-size: clamp(1rem, 2vw, 1.18rem); letter-spacing: -.03em; line-height: 1.3; }.title-card p { margin: 0; overflow-wrap: anywhere; color: var(--muted); font-size: .82rem; line-height: 1.55; }
@media (prefers-reduced-motion: reduce) { .title-group-summary::after, .map-group-summary::after { transition: none; } }
@media (max-width: 620px) { .title-group-summary { min-height: 76px; padding: 16px; }.title-group-content { padding: 0 16px 16px; }.title-grid { grid-template-columns: 1fr; }.map-group .title-grid { padding: 0 12px 12px; } }
</style>
