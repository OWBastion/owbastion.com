<script setup lang="ts">
import type { PublicAchievement } from "./AchievementCatalog.vue";
import type { OwnedTitle } from "~/types/title";

type HistoricalTitleGroup = {
  name: string;
  titles: OwnedTitle[];
};
type AchievementCard =
  | { kind: "catalog"; challenge: PublicAchievement }
  | { kind: "retired"; title: OwnedTitle };
type AchievementGroup = { category: string; cards: AchievementCard[] };

const props = defineProps<{ challenges: PublicAchievement[]; titles: OwnedTitle[] }>();

const ownedTitleKeys = computed(() => new Set(props.titles.map((title) => title.titleKey)));
const earnedCatalogCount = computed(() => props.challenges.filter((challenge) => ownedTitleKeys.value.has(challenge.titleKey)).length);
const recentTitles = computed(() => [...props.titles].sort((left, right) => right.grantedAt - left.grantedAt).slice(0, 3));
const catalogTitleKeys = computed(() => new Set(props.challenges.map((challenge) => challenge.titleKey)));
const retiredGlobalTitles = computed(() => props.titles.filter((title) => title.scope === "global" && !catalogTitleKeys.value.has(title.titleKey)));
const groupHistoricalTitles = (titles: OwnedTitle[], groupName: (title: OwnedTitle) => string): HistoricalTitleGroup[] => {
  const grouped = new Map<string, OwnedTitle[]>();
  for (const title of titles) grouped.set(groupName(title), [...(grouped.get(groupName(title)) ?? []), title]);

  const slotRank = { pioneer: 0, conqueror: 1, dominator: 2 } as const;
  return [...grouped.entries()]
    .map(([name, titles]) => ({
      name,
      titles: [...titles].sort((left, right) => (left.slot ? slotRank[left.slot] : 9) - (right.slot ? slotRank[right.slot] : 9) || left.label.localeCompare(right.label, "zh-CN")),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
};
const mapTitleGroups = computed(() => groupHistoricalTitles(
  props.titles.filter((title) => title.scope === "map"),
  (title) => title.mapName ?? "地图称号",
));
const mapTitleCount = computed(() => mapTitleGroups.value.reduce((count, group) => count + group.titles.length, 0));
const isAchievementCardEarned = (card: AchievementCard) => card.kind === "retired" || ownedTitleKeys.value.has(card.challenge.titleKey);
const groups = computed(() => {
  const grouped = new Map<string, AchievementCard[]>();
  for (const challenge of props.challenges) grouped.set(challenge.category, [...(grouped.get(challenge.category) ?? []), { kind: "catalog", challenge }]);
  for (const title of retiredGlobalTitles.value) grouped.set(title.category, [...(grouped.get(title.category) ?? []), { kind: "retired", title }]);
  const cardName = (card: AchievementCard) => card.kind === "catalog" ? card.challenge.titleName : card.title.label;
  return [...grouped.entries()]
    .map(([category, cards]): AchievementGroup => ({
      category,
      cards: [...cards].sort((left, right) => cardName(left).localeCompare(cardName(right), "zh-CN")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
});

const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
</script>

<template>
  <div class="achievement-layout">
    <div class="achievement-main">
      <p v-if="challenges.length" class="achievement-count">已获得 {{ earnedCatalogCount }} / {{ challenges.length }}</p>
      <section v-for="group in groups" :key="group.category" class="achievement-section" :aria-labelledby="`my-category-${group.category}`">
        <header class="section-heading"><h2 :id="`my-category-${group.category}`">{{ group.category }}</h2><span>{{ group.cards.filter(isAchievementCardEarned).length }} / {{ group.cards.length }}</span></header>
        <div class="achievement-grid">
          <article v-for="card in group.cards" :key="card.kind === 'catalog' ? card.challenge.challengeId : card.title.grantId" class="achievement-card" :class="{ earned: isAchievementCardEarned(card) }">
            <div class="achievement-icon" :class="{ 'has-image': card.kind === 'catalog' ? card.challenge.iconUrl : card.title.iconUrl }" aria-hidden="true"><img v-if="card.kind === 'catalog' ? card.challenge.iconUrl : card.title.iconUrl" :src="card.kind === 'catalog' ? card.challenge.iconUrl! : card.title.iconUrl!" alt="" /><UIcon v-else :name="`i-lucide-${card.kind === 'catalog' ? card.challenge.icon : card.title.icon}`" /></div>
            <div class="achievement-copy">
              <div class="achievement-title-row">
                <strong>{{ card.kind === 'catalog' ? card.challenge.titleName : card.title.label }}</strong>
                <StatusBadge v-if="card.kind === 'retired'" class="retired-status" label="不再发放" />
              </div>
              <span>{{ card.kind === 'catalog' ? card.challenge.condition : card.title.condition }}</span>
              <span v-if="card.kind === 'catalog' && card.challenge.status === 'scheduled'" class="status">未开放</span>
              <span v-else-if="card.kind === 'catalog' && card.challenge.status === 'sunsetting'" class="status">即将结束</span>
            </div>
            <span v-if="isAchievementCardEarned(card)" class="earned-status-icon" role="img" aria-label="已获得"><UIcon name="i-lucide-circle-check" /></span>
          </article>
        </div>
      </section>

      <section v-if="mapTitleGroups.length" class="achievement-section map-title-collection" aria-labelledby="map-titles-title">
        <header class="section-heading"><h2 id="map-titles-title">地图称号</h2><span>{{ mapTitleCount }} 项</span></header>
        <section v-for="(group, index) in mapTitleGroups" :key="group.name" class="map-title-group" :aria-labelledby="`map-title-${index}`">
            <header class="map-title-heading"><h3 :id="`map-title-${index}`">{{ group.name }}</h3><span>{{ group.titles.length }} 项</span></header>
            <div class="achievement-grid">
              <article v-for="title in group.titles" :key="title.grantId" class="achievement-card earned">
                <div class="achievement-icon" :class="{ 'has-image': title.iconUrl }" aria-hidden="true"><img v-if="title.iconUrl" :src="title.iconUrl" alt="" /><UIcon v-else :name="`i-lucide-${title.icon}`" /></div>
                <div class="achievement-copy"><strong>{{ title.label }}</strong><span>{{ title.condition }}</span></div>
                <span class="earned-status-icon" role="img" aria-label="已获得"><UIcon name="i-lucide-circle-check" /></span>
              </article>
            </div>
          </section>
      </section>

      <UEmpty v-if="!groups.length && !mapTitleGroups.length" title="暂无记录" variant="naked" />
    </div>

    <aside class="achievement-sidebar" aria-label="最近获得">
      <section class="sidebar-card surface-card" aria-labelledby="recent-title"><header class="sidebar-heading"><h2 id="recent-title">最近获得</h2></header><div v-if="recentTitles.length" class="recent-list"><article v-for="title in recentTitles" :key="title.grantId" class="recent-item"><div class="recent-icon" :class="{ 'has-image': title.iconUrl }" aria-hidden="true"><img v-if="title.iconUrl" :src="title.iconUrl" alt="" /><UIcon v-else :name="`i-lucide-${title.icon}`" /></div><div><strong>{{ title.label }}</strong><span>{{ formatDate(title.grantedAt) }}</span></div></article></div><UEmpty v-else title="暂无称号" variant="naked" /></section>
    </aside>
  </div>
</template>

<style scoped>
.achievement-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(15.625rem, 18.75rem); align-items: start; gap: 1.25rem; }
.achievement-main { display: grid; gap: 1.25rem; }
.achievement-count { margin: 0; color: var(--muted); font-size: var(--type-caption-size); }
.achievement-section { padding: clamp(1.125rem, 3vw, 1.625rem); border: 1px solid var(--line); border-radius: 1.125rem; background: var(--surface); }
.section-heading, .sidebar-heading, .map-title-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.section-heading { margin-bottom: 1rem; }
.section-heading h2, .sidebar-heading h2, .map-title-heading h3 { margin: 0; color: var(--text); }
.section-heading h2, .sidebar-heading h2 { font-size: 1.05rem; }
.map-title-heading h3 { font-size: 0.94rem; }
.section-heading span, .map-title-heading span { color: var(--quiet); font-size: 0.78rem; }
.map-title-collection { display: grid; gap: 1rem; }
.map-title-group { display: grid; gap: 0.75rem; }
.map-title-group + .map-title-group { padding-top: 1.125rem; border-top: 1px solid var(--line); }
.achievement-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.625rem; }
.achievement-card { display: grid; grid-template-columns: 4rem minmax(0, 1fr) auto; align-items: start; gap: 0.8125rem; min-width: 0; padding: 1rem; border: 1px solid var(--line); border-radius: 0.875rem; background: color-mix(in oklch, var(--surface-raised) 64%, var(--surface)); transition: border-color 160ms ease, background 160ms ease; }
.achievement-card.earned { border-color: color-mix(in oklch, var(--success) 44%, var(--line)); background: color-mix(in oklch, var(--success-surface) 16%, var(--surface)); }
.achievement-icon, .recent-icon { display: grid; place-items: center; border: 1px dashed var(--line-strong); border-radius: 50%; color: var(--quiet); background: var(--surface); }
.achievement-icon.has-image, .recent-icon.has-image { border-color: transparent; background: transparent; }
.achievement-card.earned .achievement-icon:not(.has-image) { border-style: solid; border-color: color-mix(in oklch, var(--success) 48%, var(--line)); color: var(--success); background: color-mix(in oklch, var(--success-surface) 20%, var(--surface)); }
.achievement-icon { width: 3.375rem; height: 3.375rem; overflow: hidden; }
.achievement-icon.has-image { width: 4rem; height: 4rem; }
.achievement-icon img, .recent-icon img { width: 1.75rem; height: 1.75rem; object-fit: contain; }
.achievement-icon.has-image img { width: 100%; height: 100%; }
.achievement-copy { display: grid; align-content: start; gap: 0.375rem; min-width: 0; }
.achievement-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; min-width: 0; }
.achievement-copy strong, .recent-item strong { overflow-wrap: anywhere; color: var(--text); }
.achievement-copy > span:not(.earned-status-icon):not(.status), .recent-item span { color: var(--muted); font-size: 0.76rem; line-height: 1.5; }
.earned-status-icon { display: inline-grid; width: fit-content; place-items: center; color: var(--success); font-size: 1rem; }
.status { width: fit-content; color: var(--quiet); font-size: 0.7rem; font-weight: 720; }
.achievement-sidebar { display: grid; gap: 1.25rem; }
.sidebar-card { padding: 1.25rem; }
.recent-list { display: grid; gap: 0.75rem; margin-top: 1rem; }
.recent-item { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); align-items: center; gap: 0.75rem; }
.recent-item > div:last-child { display: grid; gap: 0.25rem; }
.recent-icon { width: 2.5rem; height: 2.5rem; }
@media (prefers-reduced-motion: reduce) { .achievement-card { transition: none; } }
@media (prefers-reduced-transparency: reduce) { .achievement-card { background: var(--surface-raised); }.achievement-card.earned { background: color-mix(in oklch, var(--success-surface) 24%, var(--surface)); } }
@media (prefers-contrast: more) { .achievement-card { border-color: var(--text); } }
@media (max-width: 820px) { .achievement-layout { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .achievement-grid { grid-template-columns: 1fr; }.achievement-section, .sidebar-card { padding: 1rem; } }
</style>
