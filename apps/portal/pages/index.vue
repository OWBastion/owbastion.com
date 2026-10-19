<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";
import { formatEditorialDate } from "~/utils/editorial";
import { emptyEventFilters, matchesEvent, sortEvents } from "~/utils/event-filters";
import { introductionPages } from "~/utils/introduction-pages";

const { player } = useCurrentPlayer();

const { data: releases } = await useAsyncData("home-latest-changelog", () => queryEditorialSummaries("changelog"), { default: () => [] });
// Summaries are generated newest first.
const latest = computed(() => releases.value[0] ?? null);

// Catalog figures are optional decoration, loaded in the browser so the home SSR stays independent of
// catalog availability; a failed catalog hides its figure instead of blocking the page.
const { data: catalog } = useLazyAsyncData("home-catalog", async () => {
  const [events, maps, achievements] = await Promise.allSettled([
    usePublicCatalog<{ items: RandomEvent[] }>("events"),
    usePublicCatalog<{ items: unknown[] }>("maps"),
    usePublicCatalog<{ items: unknown[] }>("achievements"),
  ]);
  return {
    events: events.status === "fulfilled" ? events.value.items.filter((event) => matchesEvent(event, emptyEventFilters())) : null,
    mapCount: maps.status === "fulfilled" ? maps.value.items.length : null,
    achievementCount: achievements.status === "fulfilled" ? achievements.value.items.length : null,
  };
}, { server: false });

const stats = computed(() => [
  { label: "已实装事件", value: catalog.value?.events?.length ?? null, to: "/events" },
  { label: "地图", value: catalog.value?.mapCount ?? null, to: "/maps" },
  { label: "成就", value: catalog.value?.achievementCount ?? null, to: "/achievements" },
]);
const newestEvents = computed(() => sortEvents(catalog.value?.events ?? [], "latest", () => null).slice(0, 3));

const featured = introductionPages.slice(0, 2);
const directory = introductionPages.slice(2);

useSeoMeta({
  title: "躲避堡垒 3 · 玩家社区",
  description: "事件、成就、地图与版本更新。",
});
</script>

<template>
  <main class="home-page page-shell">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">守望先锋 工坊模式</p>
        <h1 id="hero-title" class="hero-title">躲避堡垒 <span class="hero-numeral">3</span></h1>
        <p class="hero-lead">了解随机事件与地图，挑战成就，提交截图把每一次通关记录下来。</p>
        <div class="hero-actions">
          <NuxtLink :to="player ? '/me' : '/login'" class="cta cta--primary pressable">
            {{ player ? "进入玩家中心" : "登录" }}
            <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
          </NuxtLink>
          <NuxtLink to="/events" class="cta cta--ghost pressable">浏览随机事件</NuxtLink>
        </div>
      </div>

      <aside class="intel" aria-label="当前概况">
        <div class="intel-head">
          <span class="intel-label font-display">STATUS</span>
          <span class="intel-status"><span class="intel-dot" aria-hidden="true" />轮换挑战未开放</span>
        </div>
        <NuxtLink v-if="latest" :to="latest.path" class="intel-release pressable-soft">
          <span class="intel-release-meta">
            <span class="release-version num"><span class="sr-only">版本 </span>{{ latest.version }}</span>
            <time :datetime="latest.releasedAt">{{ formatEditorialDate(latest.releasedAt) }}</time>
          </span>
          <strong>{{ latest.title }}</strong>
          <span class="intel-release-more">阅读更新日志 <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></span>
        </NuxtLink>
        <dl class="intel-stats">
          <NuxtLink v-for="stat in stats" :key="stat.to" :to="stat.to" class="intel-stat">
            <dt>{{ stat.label }}</dt>
            <dd class="num">{{ stat.value ?? "—" }}</dd>
          </NuxtLink>
        </dl>
      </aside>
    </section>

    <section v-if="newestEvents.length" class="block" aria-labelledby="new-events-title">
      <header class="block-head">
        <div>
          <p class="eyebrow">Random events</p>
          <h2 id="new-events-title" class="type-headline">最新随机事件</h2>
        </div>
        <NuxtLink to="/events" class="block-link">全部事件 <UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
      </header>
      <ul class="event-strip">
        <li v-for="event in newestEvents" :key="event.eventId">
          <NuxtLink to="/events" class="event-card interactive-card pressable-soft">
            <span class="event-meta">
              <span class="event-rarity num">{{ event.rarity || "—" }}</span>
              <span>{{ event.category }}</span>
              <span class="event-version num">{{ event.gameVersion }}</span>
            </span>
            <strong class="event-name">{{ event.name }}</strong>
            <span class="event-desc">{{ event.description }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section class="block" aria-labelledby="directory-title">
      <header class="block-head">
        <div>
          <p class="eyebrow">Directory</p>
          <h2 id="directory-title" class="type-headline">目录</h2>
        </div>
      </header>
      <div class="bento">
        <NuxtLink v-for="page in featured" :key="page.to" :to="page.to" class="tile tile--feature interactive-card pressable-soft">
          <UIcon :name="page.icon" class="tile-icon" aria-hidden="true" />
          <span class="tile-body">
            <strong class="tile-title">{{ page.label }}</strong>
            <span class="tile-desc">{{ page.description }}</span>
          </span>
          <UIcon name="i-lucide-arrow-up-right" class="tile-arrow" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink v-for="page in directory" :key="page.to" :to="page.to" class="tile interactive-card pressable-soft">
          <UIcon :name="page.icon" class="tile-icon" aria-hidden="true" />
          <span class="tile-body">
            <strong class="tile-title">{{ page.label }}</strong>
            <span class="tile-desc">{{ page.description }}</span>
          </span>
          <UIcon name="i-lucide-arrow-up-right" class="tile-arrow" aria-hidden="true" />
        </NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-page { container-type: inline-size; padding-block: clamp(2.5rem, 8vh, 5rem) clamp(3rem, 8vh, 5rem); }

/* Hero */
.hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: clamp(2rem, 5vw, 4.5rem); align-items: end; padding-bottom: clamp(3rem, 8vh, 5rem); }
.hero-title { display: flex; align-items: flex-end; gap: .04em; margin: 0; font-family: var(--font-display); font-size: clamp(2.75rem, 8.5cqi, 7rem); font-weight: 700; letter-spacing: -.04em; line-height: .92; white-space: nowrap; }
.hero-numeral { color: transparent; font-size: 1.45em; line-height: .78; -webkit-text-stroke: 2px var(--accent); text-shadow: 0 0 2.5rem color-mix(in oklch, var(--accent) 35%, transparent); }
.hero-lead { max-width: 30rem; margin: var(--space-6) 0 0; color: var(--muted); font-size: clamp(1rem, 1.6vw, 1.125rem); line-height: 1.7; }
.hero-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-8); }
.cta { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--control-lg); padding: 0 var(--space-5); border-radius: var(--radius-control); font-size: .9375rem; font-weight: 700; text-decoration: none; transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease; }
.cta--primary { color: var(--on-accent); background: var(--accent); clip-path: polygon(0 0, 100% 0, 100% calc(100% - .625rem), calc(100% - .625rem) 100%, 0 100%); }
.cta--primary:hover, .cta--primary:focus-visible { background: color-mix(in oklch, var(--accent) 86%, white); }
.cta--ghost { border: 1px solid var(--line-strong); color: var(--text); }
.cta--ghost:hover, .cta--ghost:focus-visible { border-color: var(--accent); color: var(--accent); }

/* Intel panel */
.intel { position: relative; display: grid; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--line-strong); border-radius: var(--radius-card); background: color-mix(in oklch, var(--surface) 82%, transparent); backdrop-filter: blur(12px); }
.intel::before, .intel::after { content: ""; position: absolute; width: .875rem; height: .875rem; border-color: var(--accent); border-style: solid; pointer-events: none; }
.intel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; border-top-left-radius: var(--radius-card); }
.intel::after { right: -1px; bottom: -1px; border-width: 0 2px 2px 0; border-bottom-right-radius: var(--radius-card); }
.intel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: var(--type-caption-size); }
.intel-label { color: var(--quiet); letter-spacing: .14em; }
.intel-status { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--muted); }
.intel-dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--quiet); }
.intel-release { display: grid; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); background: linear-gradient(135deg, color-mix(in oklch, var(--signal) 12%, transparent), transparent 60%), var(--surface); color: inherit; text-decoration: none; transition: border-color 160ms ease; }
.intel-release:hover, .intel-release:focus-visible { border-color: color-mix(in oklch, var(--signal) 60%, var(--line)); }
.intel-release strong { font-size: 1.0625rem; font-weight: 600; line-height: 1.4; }
.intel-release-meta { display: flex; align-items: center; gap: var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); }
.release-version { padding: .1rem .5rem; border-radius: calc(var(--radius-control) / 1.5); color: var(--page); background: var(--signal); font-weight: 700; }
.intel-release-more { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--signal); font-size: var(--type-caption-size); font-weight: 600; }
.intel-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border: 1px solid var(--line); border-radius: var(--radius-control); }
.intel-stat { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); color: inherit; text-decoration: none; transition: background-color 160ms ease; }
.intel-stat + .intel-stat { border-left: 1px solid var(--line); }
.intel-stat:hover, .intel-stat:focus-visible { background: color-mix(in oklch, var(--accent) 8%, transparent); }
.intel-stat dt { color: var(--quiet); font-size: var(--type-caption-size); }
.intel-stat dd { margin: 0; color: var(--text); font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 700; line-height: 1; }

/* Sections */
.block { padding-block: var(--space-8); border-top: 1px solid var(--line); }
.block-head { display: flex; align-items: end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
.block-link { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; text-decoration: none; }
.block-link:hover, .block-link:focus-visible { text-decoration: underline; }

/* Newest events */
.event-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
.event-card { display: grid; height: 100%; align-content: start; gap: var(--space-3); padding: var(--space-5); border-radius: var(--radius-card); }
.event-meta { display: flex; align-items: center; gap: var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); }
.event-rarity { min-width: 2rem; padding: .05rem .4rem; border: 1px solid color-mix(in oklch, var(--accent) 50%, var(--line)); border-radius: calc(var(--radius-control) / 1.5); color: var(--accent); font-weight: 700; text-align: center; }
.event-version { margin-left: auto; }
.event-name { font-size: 1.125rem; font-weight: 600; line-height: 1.35; }
.event-desc { display: -webkit-box; overflow: hidden; color: var(--muted); font-size: var(--type-body-sm-size); line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }

/* Directory bento */
.bento { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); }
.tile { position: relative; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: var(--space-4); padding: var(--space-5); border-radius: var(--radius-card); overflow: hidden; }
.tile--feature { grid-column: span 2; grid-template-columns: 1fr; align-content: space-between; min-height: 11rem; padding: var(--space-6); background: radial-gradient(120% 120% at 100% 0%, color-mix(in oklch, var(--accent) 10%, transparent), transparent 55%), var(--surface); }
.tile-icon { width: 1.5rem; height: 1.5rem; color: var(--accent); }
.tile--feature .tile-icon { width: 2rem; height: 2rem; }
.tile-body { display: grid; gap: var(--space-1); min-width: 0; }
.tile-title { font-family: var(--font-display); font-size: 1.0625rem; font-weight: 600; }
.tile--feature .tile-title { font-size: clamp(1.375rem, 2.4vw, 1.75rem); }
.tile-desc { color: var(--muted); font-size: var(--type-caption-size); }
.tile-arrow { position: absolute; top: var(--space-4); right: var(--space-4); width: 1rem; height: 1rem; color: var(--quiet); transition: color 160ms ease, transform 160ms ease; }
.tile:hover .tile-arrow, .tile:focus-visible .tile-arrow { color: var(--accent); transform: translate(2px, -2px); }

@container (max-width: 56rem) {
  .hero { grid-template-columns: 1fr; align-items: start; }
  .hero-title { font-size: clamp(2.75rem, 15cqi, 6rem); }
  .event-strip { grid-template-columns: 1fr; }
  .bento { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 36rem) {
  .bento { grid-template-columns: 1fr; }
  .tile--feature { grid-column: auto; min-height: 8rem; }
  .intel-stat { padding: var(--space-3); }
}
@media (prefers-reduced-motion: reduce) {
  .tile-arrow { transition: none; }
}
</style>
