<script setup lang="ts">
import { introductionPages } from "~/utils/introduction-pages";

const route = useRoute();
const showFooter = computed(() => !route.path.startsWith("/admin"));
</script>

<template>
  <div class="app-shell">
    <GridGlow />
    <AppHeader />
    <div class="app-main" :class="{ 'app-main--tabbed': showFooter }">
      <slot />
      <footer v-if="showFooter" class="site-footer">
        <div class="site-footer__inner">
          <div class="site-footer__brand">
            <strong class="font-display">躲避堡垒<em>3</em></strong>
            <span>玩家社区 · 事件、成就与地图记录</span>
          </div>
          <nav class="site-footer__nav" aria-label="页脚导航">
            <NuxtLink v-for="page in introductionPages" :key="page.to" :to="page.to">{{ page.label }}</NuxtLink>
            <a :href="`https://owbastion.com${route.fullPath}`">回到旧版</a>
          </nav>
          <span class="site-footer__copy num">© {{ new Date().getFullYear() }} 躲避堡垒 3</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.app-shell { min-height: 100svh; }
.app-main { display: flex; min-width: 0; min-height: calc(100svh - 3.5rem); flex-direction: column; padding-left: var(--sidebar-width); }
.app-main--tabbed { padding-bottom: var(--tab-bar-height); }
.site-footer { margin-top: auto; border-top: 1px solid var(--line); background: color-mix(in oklch, var(--page) 70%, transparent); }
.site-footer__inner { display: grid; grid-template-columns: 1fr auto; gap: var(--space-4) var(--space-8); width: min(100% - 3rem, 90rem); margin: 0 auto; padding-block: var(--space-8); color: var(--quiet); font-size: var(--type-caption-size); }
.site-footer__brand { display: grid; gap: var(--space-1); }
.site-footer__brand strong { color: var(--text); font-size: 1rem; letter-spacing: .02em; }
.site-footer__brand em { margin-left: .2em; color: var(--accent); font-style: normal; }
.site-footer__nav { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-5); }
.site-footer__nav a { color: var(--muted); text-decoration: none; }
.site-footer__nav a:hover, .site-footer__nav a:focus-visible { color: var(--accent); }
.site-footer__copy { grid-column: 1 / -1; }
@media (max-width: 47.99rem) {
  .site-footer__inner { grid-template-columns: 1fr; }
}
</style>
