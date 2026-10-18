<script setup lang="ts">
import { formatEditorialDate } from "~/utils/editorial";
import { introductionPages } from "~/utils/introduction-pages";

const { data: releases } = await useAsyncData("home-latest-changelog", () => queryEditorialSummaries("changelog"), { default: () => [] });
// Summaries are generated newest first.
const latest = computed(() => releases.value[0] ?? null);

useSeoMeta({
  title: "躲避堡垒 3 · 玩家社区",
  description: "事件、成就、地图与版本更新。",
});
</script>

<template>
  <main class="home-page page-shell">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <h1 id="hero-title" class="type-display">躲避堡垒 3</h1>
        <p class="type-title hero-topic">事件 · 成就 · 地图</p>
      </div>
    </section>

    <section id="rotation" class="rotation-status surface-card">
      <p>轮换挑战未开放</p>
    </section>

    <section v-if="latest" class="content-section latest-update" aria-labelledby="latest-title">
      <div class="latest-head">
        <h2 id="latest-title" class="type-title">最新版本</h2>
        <NuxtLink to="/changelog" class="latest-all">全部版本更新</NuxtLink>
      </div>
      <NuxtLink :to="latest.path" class="latest-card content-card content-card--link interactive-card pressable-soft">
        <span class="latest-meta">
          <span class="latest-version num"><span class="sr-only">版本 </span>{{ latest.version }}</span>
          <time class="latest-date" :datetime="latest.releasedAt">{{ formatEditorialDate(latest.releasedAt) }}</time>
        </span>
        <h3 class="type-headline">{{ latest.title }}</h3>
      </NuxtLink>
    </section>

    <section class="content-section" aria-labelledby="content-title">
      <h2 id="content-title" class="type-title">目录</h2>
      <div class="content-grid directory-grid">
        <NuxtLink v-for="page in introductionPages" :key="page.to" :to="page.to" class="content-card content-card--link interactive-card pressable-soft directory-card">
          <UIcon :name="page.icon" class="directory-icon" aria-hidden="true" />
          <h3 class="type-headline">{{ page.label }}</h3>
          <p class="directory-description">{{ page.description }}</p>
        </NuxtLink>
      </div>
    </section>

    <footer class="footer">
      <span>躲避堡垒 3 社区</span>
      <span>© {{ new Date().getFullYear() }} 躲避堡垒 3</span>
    </footer>
  </main>
</template>

<style scoped>
.home-page { padding-block: clamp(3.5rem, 9vh, 6rem) 2.5rem; }
.hero { padding-block: clamp(3rem, 8vh, 5.5rem) clamp(3.5rem, 9vh, 6rem); }
.hero h1 { margin-bottom: var(--space-3); }
.hero-topic { margin: 0; color: var(--muted); }
.rotation-status { margin-bottom: var(--space-8); padding: var(--space-4) var(--space-6); color: var(--muted); font-size: .85rem; }
.rotation-status p { margin: 0; }
.content-section { margin-bottom: var(--space-8); }
.content-section > .type-title { margin-bottom: var(--space-5); }
.latest-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-5); }
.latest-head .type-title { margin: 0; }
.latest-all { color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; text-decoration: none; }
.latest-all:hover, .latest-all:focus-visible { text-decoration: underline; }
.latest-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); }
.latest-update .content-card .type-headline { max-width: 36ch; }
.latest-version { padding: 0 var(--space-3); border: 1px solid color-mix(in oklch, var(--accent) 42%, var(--line)); border-radius: var(--radius-pill); background: var(--accent-surface); color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.8; }
.content-card { display: grid; min-height: 0; align-content: start; padding: var(--space-6); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); color: inherit; text-decoration: none; }
.content-card .type-headline { max-width: 18ch; margin: 0; }
.content-card--link.interactive-card:hover,
.content-card--link.interactive-card:focus-visible {
  border-color: color-mix(in oklch, var(--accent) 42%, var(--line-strong));
  background: color-mix(in oklch, var(--surface) 88%, var(--accent-surface));
}
.latest-update .latest-card,
.latest-update .latest-card:hover,
.latest-update .latest-card:focus-visible { background: radial-gradient(120% 140% at 0% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 58%), var(--surface); }
.directory-card { gap: var(--space-2); }
.directory-icon { width: 1.5rem; height: 1.5rem; margin-bottom: var(--space-2); color: var(--accent); }
.directory-description { margin: 0; color: var(--muted); font-size: var(--type-caption-size); }
.footer { display: flex; justify-content: space-between; gap: var(--space-4); padding-top: var(--space-6); border-top: 1px solid var(--line); color: var(--quiet); font-size: var(--type-caption-size); }
@media (max-width: 47.99rem) {
  .content-card { padding: var(--space-5); }
  .footer { flex-direction: column; align-items: flex-start; gap: var(--space-2); }
}
</style>
