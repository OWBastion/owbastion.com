<script setup lang="ts">
const { player } = useCurrentPlayer();

const { data: releases } = await useAsyncData("home-latest-changelog", () => queryEditorialSummaries("changelog"), { default: () => [] });
// Summaries are generated newest first.
const latest = computed(() => releases.value[0] ?? null);

useSeoMeta({
  title: "躲避堡垒 3 · 玩家社区",
  description: "事件、成就、地图与版本更新。",
});
</script>

<template>
  <main class="home page-shell">
    <h1 class="home__title">躲避堡垒 <span class="home__numeral">3</span></h1>
    <p class="home__lead">通关，截图，拿称号。</p>
    <NuxtLink :to="player ? '/me/submissions/new' : '/login'" class="home__cta pressable">
      {{ player ? "提交截图" : "开始" }}
      <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
    </NuxtLink>
    <NuxtLink v-if="latest" :to="latest.path" class="home__release">
      <span class="num">{{ latest.version }}</span>{{ latest.title }}
    </NuxtLink>
  </main>
</template>

<style scoped>
.home { container-type: inline-size; display: grid; align-content: center; justify-items: start; gap: var(--space-6); min-height: min(70vh, 40rem); padding-block: var(--space-16); }
.home__title { display: flex; align-items: flex-end; gap: .04em; margin: 0; font-family: var(--font-display); font-size: clamp(2.75rem, 11cqi, 8rem); font-weight: 700; letter-spacing: -.04em; line-height: .92; white-space: nowrap; }
.home__numeral { color: transparent; font-size: 1.45em; line-height: .78; -webkit-text-stroke: 2px var(--accent); text-shadow: 0 0 2.5rem color-mix(in oklch, var(--accent) 35%, transparent); }
.home__lead { margin: 0; color: var(--muted); font-size: clamp(1.125rem, 2vw, 1.375rem); }
.home__cta { display: inline-flex; align-items: center; gap: var(--space-3); min-height: 3.5rem; margin-top: var(--space-2); padding: 0 var(--space-8); color: var(--on-accent); background: var(--accent); clip-path: polygon(0 0, 100% 0, 100% calc(100% - .75rem), calc(100% - .75rem) 100%, 0 100%); font-size: 1.125rem; font-weight: 700; text-decoration: none; transition: background-color 160ms ease; }
.home__cta:hover, .home__cta:focus-visible { background: color-mix(in oklch, var(--accent) 86%, white); }
.home__release { display: inline-flex; align-items: baseline; gap: var(--space-2); color: var(--quiet); font-size: var(--type-label-sm-size); text-decoration: none; }
.home__release:hover { color: var(--text); }
.home__release .num { color: var(--accent); font-weight: 700; }
@media (prefers-reduced-motion: reduce) { .home__cta { transition: none; } }
</style>
