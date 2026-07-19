<script setup lang="ts">
import type { PublicAchievement } from "./AchievementCatalog.vue";
import type { OwnedTitle } from "~/types/title";

type HistoricalTitleGroup = {
  name: string;
  titles: OwnedTitle[];
  latestGrantedAt: number;
};
type AchievementCard =
  | { kind: "catalog"; challenge: PublicAchievement }
  | { kind: "retired"; title: OwnedTitle };
type AchievementGroup = { category: string; cards: AchievementCard[] };

const props = defineProps<{ challenges: PublicAchievement[]; titles: OwnedTitle[] }>();

const ownedTitleKeys = computed(() => new Set(props.titles.map((title) => title.titleKey)));
const earnedCatalogCount = computed(() => props.challenges.filter((challenge) => ownedTitleKeys.value.has(challenge.titleKey)).length);
const completionRate = computed(() => props.challenges.length ? Math.round((earnedCatalogCount.value / props.challenges.length) * 100) : 0);
const progressStyle = computed(() => ({ background: `conic-gradient(var(--accent) ${completionRate.value * 3.6}deg, var(--surface-raised) 0deg)` }));
const recentTitles = computed(() => [...props.titles].sort((left, right) => right.grantedAt - left.grantedAt).slice(0, 3));
const catalogTitleKeys = computed(() => new Set(props.challenges.map((challenge) => challenge.titleKey)));
const retiredGlobalTitles = computed(() => props.titles.filter((title) => title.scope === "global" && !catalogTitleKeys.value.has(title.titleKey)));
const groupHistoricalTitles = (titles: OwnedTitle[], groupName: (title: OwnedTitle) => string): HistoricalTitleGroup[] => {
  const grouped = new Map<string, OwnedTitle[]>();
  for (const title of titles) grouped.set(groupName(title), [...(grouped.get(groupName(title)) ?? []), title]);

  return [...grouped.entries()]
    .map(([name, titles]) => ({
      name,
      titles: [...titles].sort((left, right) => right.grantedAt - left.grantedAt),
      latestGrantedAt: Math.max(...titles.map((title) => title.grantedAt)),
    }))
    .sort((left, right) => right.latestGrantedAt - left.latestGrantedAt);
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
  return [...grouped.entries()].map(([category, cards]): AchievementGroup => ({ category, cards }));
});

const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
</script>

<template>
  <section class="achievement-summary surface-card" aria-label="成就概览">
    <article class="summary-metric"><span class="summary-icon" aria-hidden="true"><UIcon name="i-lucide-trophy" /></span><strong>{{ earnedCatalogCount }}<small> / {{ challenges.length }}</small></strong><span>已获得</span></article>
    <article class="summary-metric"><span class="summary-icon" aria-hidden="true"><UIcon name="i-lucide-chart-no-axes-combined" /></span><strong>{{ completionRate }}<small>%</small></strong><span>完成率</span></article>
    <article class="summary-metric summary-metric-latest"><span class="summary-icon" aria-hidden="true"><UIcon name="i-lucide-sparkles" /></span><div><span>最近获得</span><strong>{{ recentTitles[0]?.label ?? "暂无称号" }}</strong></div></article>
  </section>

  <div class="achievement-layout">
    <div class="achievement-main">
      <section v-for="group in groups" :key="group.category" class="achievement-section" :aria-labelledby="`my-category-${group.category}`">
        <header class="section-heading"><h2 :id="`my-category-${group.category}`">{{ group.category }}</h2><span>{{ group.cards.filter(isAchievementCardEarned).length }} / {{ group.cards.length }}</span></header>
        <div class="achievement-grid">
          <article v-for="card in group.cards" :key="card.kind === 'catalog' ? card.challenge.challengeId : card.title.grantId" class="achievement-card" :class="{ earned: isAchievementCardEarned(card) }">
            <div class="achievement-icon" :class="{ 'has-image': card.kind === 'catalog' ? card.challenge.iconUrl : card.title.iconUrl }" aria-hidden="true"><img v-if="card.kind === 'catalog' ? card.challenge.iconUrl : card.title.iconUrl" :src="card.kind === 'catalog' ? card.challenge.iconUrl! : card.title.iconUrl!" alt="" /><UIcon v-else :name="`i-lucide-${card.kind === 'catalog' ? card.challenge.icon : card.title.icon}`" /></div>
            <div class="achievement-copy"><strong>{{ card.kind === 'catalog' ? card.challenge.titleName : card.title.label }}</strong><span>{{ card.kind === 'catalog' ? card.challenge.condition : card.title.condition }}</span><UBadge v-if="card.kind === 'retired'" class="retired-status" color="neutral" variant="subtle" size="xs">不再发放</UBadge><span v-else-if="card.challenge.status === 'scheduled'" class="status">未开放</span><span v-else-if="card.challenge.status === 'sunsetting'" class="status">即将结束</span></div>
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

    <aside class="achievement-sidebar" aria-label="成就统计">
      <section class="sidebar-card surface-card" aria-labelledby="recent-title"><header class="sidebar-heading"><h2 id="recent-title">最近获得</h2></header><div v-if="recentTitles.length" class="recent-list"><article v-for="title in recentTitles" :key="title.grantId" class="recent-item"><div class="recent-icon" :class="{ 'has-image': title.iconUrl }" aria-hidden="true"><img v-if="title.iconUrl" :src="title.iconUrl" alt="" /><UIcon v-else :name="`i-lucide-${title.icon}`" /></div><div><strong>{{ title.label }}</strong><span>{{ formatDate(title.grantedAt) }}</span></div></article></div><UEmpty v-else title="暂无称号" variant="naked" /></section>
      <section class="sidebar-card surface-card" aria-labelledby="progress-title"><header class="sidebar-heading"><h2 id="progress-title">成就进度</h2></header><div class="progress-ring" :style="progressStyle" role="img" :aria-label="`成就完成率 ${completionRate}%`"><div><strong>{{ completionRate }}%</strong><span>已完成</span></div></div><p class="progress-copy">已获得 {{ earnedCatalogCount }} 项，共 {{ challenges.length }} 项</p></section>
    </aside>
  </div>
</template>

<style scoped>
.achievement-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 20px; overflow: hidden; }.summary-metric { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 5px 12px; min-height: 112px; padding: 22px; border-right: 1px solid var(--line); }.summary-metric:last-child { border-right: 0; }.summary-icon { display: grid; grid-row: span 2; width: 40px; height: 40px; place-items: center; border: 1px solid color-mix(in oklch, var(--accent) 35%, var(--line)); border-radius: 50%; color: var(--accent); background: color-mix(in oklch, var(--accent-surface) 68%, var(--surface)); font-size: 1.2rem; }.summary-metric strong { color: var(--text); font-size: clamp(1.45rem, 3vw, 2rem); letter-spacing: -.055em; }.summary-metric small { color: var(--quiet); font-size: .85rem; font-weight: 650; letter-spacing: -.02em; }.summary-metric > span:not(.summary-icon), .summary-metric div > span { color: var(--muted); font-size: .77rem; }.summary-metric-latest div { display: grid; gap: 5px; }.summary-metric-latest div strong { font-size: 1.1rem; letter-spacing: -.03em; }.achievement-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 300px); align-items: start; gap: 20px; }.achievement-main { display: grid; gap: 20px; }.achievement-section { padding: clamp(18px, 3vw, 26px); border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }.section-heading, .sidebar-heading, .map-title-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.section-heading { margin-bottom: 16px; }.section-heading h2, .sidebar-heading h2, .map-title-heading h3 { margin: 0; color: var(--text); letter-spacing: -.03em; }.section-heading h2, .sidebar-heading h2 { font-size: 1.05rem; }.map-title-heading h3 { font-size: .94rem; }.section-heading span, .map-title-heading span { color: var(--quiet); font-size: .78rem; }.map-title-collection, .map-title-group { display: grid; gap: 12px; }.map-title-group + .map-title-group { padding-top: 18px; border-top: 1px solid var(--line); }.map-title-group { padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in oklch, var(--surface-raised) 48%, var(--surface)); }.achievement-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.achievement-card { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: start; gap: 13px; min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in oklch, var(--surface-raised) 64%, var(--surface)); transition: transform 100ms ease-out, border-color 160ms ease, background 160ms ease; }.achievement-card:active { transform: scale(.98); }.achievement-card.earned { border-color: color-mix(in oklch, oklch(56% .10 145) 44%, var(--line)); background: color-mix(in oklch, oklch(72% .11 145) 16%, var(--surface)); }.achievement-icon, .recent-icon { display: grid; place-items: center; border: 1px dashed var(--line-strong); border-radius: 50%; color: var(--quiet); background: var(--surface); }.achievement-icon.has-image, .recent-icon.has-image { border-color: transparent; background: transparent; }.achievement-card.earned .achievement-icon:not(.has-image) { border-style: solid; border-color: color-mix(in oklch, oklch(56% .10 145) 48%, var(--line)); color: oklch(52% .10 145); background: color-mix(in oklch, oklch(72% .11 145) 20%, var(--surface)); }.achievement-icon { width: 54px; height: 54px; overflow: hidden; }.achievement-icon.has-image { width: 64px; height: 64px; }.achievement-icon img, .recent-icon img { width: 28px; height: 28px; object-fit: contain; }.achievement-icon.has-image img { width: 100%; height: 100%; }.achievement-copy { display: grid; align-content: start; gap: 6px; min-width: 0; }.achievement-copy strong, .recent-item strong { overflow-wrap: anywhere; color: var(--text); letter-spacing: -.025em; }.achievement-copy > span:not(.earned-status-icon):not(.status), .recent-item span, .progress-copy { color: var(--muted); font-size: .76rem; line-height: 1.5; }.earned-status-icon { display: inline-grid; width: fit-content; place-items: center; color: oklch(50% .10 145); font-size: 1rem; }.status { width: fit-content; color: var(--quiet); font-size: .7rem; font-weight: 720; }.achievement-sidebar { display: grid; gap: 20px; }.sidebar-card { padding: 20px; }.recent-list { display: grid; gap: 12px; margin-top: 16px; }.recent-item { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; gap: 12px; }.recent-item > div:last-child { display: grid; gap: 4px; }.recent-icon { width: 40px; height: 40px; }.progress-ring { display: grid; width: 150px; height: 150px; place-items: center; margin: 22px auto 16px; border-radius: 50%; }.progress-ring > div { display: grid; width: 118px; height: 118px; place-items: center; align-content: center; border-radius: 50%; background: var(--surface); }.progress-ring strong { color: var(--text); font-size: 1.65rem; letter-spacing: -.055em; }.progress-ring span { color: var(--quiet); font-size: .72rem; }.progress-copy { margin: 0; text-align: center; } @media (prefers-reduced-motion: reduce) { .achievement-card { transition: none; }.achievement-card:active { transform: none; } } @media (prefers-reduced-transparency: reduce) { .achievement-card { background: var(--surface-raised); }.achievement-card.earned { background: color-mix(in oklch, oklch(72% .11 145) 24%, var(--surface)); } } @media (prefers-contrast: more) { .achievement-card, .map-title-group { border-color: var(--text); } } @media (max-width: 820px) { .achievement-layout { grid-template-columns: 1fr; }.achievement-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }.progress-ring { margin-top: 16px; } } @media (max-width: 620px) { .achievement-summary { grid-template-columns: 1fr; }.summary-metric { min-height: 0; padding: 17px; border-right: 0; border-bottom: 1px solid var(--line); }.summary-metric:last-child { border-bottom: 0; }.achievement-grid, .achievement-sidebar { grid-template-columns: 1fr; }.achievement-section, .sidebar-card { padding: 16px; }.map-title-group { padding: 12px; } }
</style>
