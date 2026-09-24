<script setup lang="ts">
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

    <section class="content-section" aria-labelledby="content-title">
      <h2 id="content-title" class="type-title">目录</h2>
      <div class="content-grid directory-grid">
        <NuxtLink id="events" to="/events" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">随机事件</h3>
        </NuxtLink>
        <NuxtLink id="maps" to="/maps" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">地图</h3>
        </NuxtLink>
        <NuxtLink id="achievements" to="/achievements" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">成就</h3>
        </NuxtLink>
        <NuxtLink to="/changelog" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">版本更新</h3>
        </NuxtLink>
        <NuxtLink to="/blog" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">开发日志</h3>
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
.content-card { display: grid; min-height: 0; align-content: start; padding: var(--space-6); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); color: inherit; text-decoration: none; }
.content-card .type-headline { max-width: 18ch; margin: 0; }
.content-card--link.interactive-card:hover,
.content-card--link.interactive-card:focus-visible {
  border-color: color-mix(in oklch, var(--accent) 42%, var(--line-strong));
  background: color-mix(in oklch, var(--surface) 88%, var(--accent-surface));
}
.footer { display: flex; justify-content: space-between; gap: var(--space-4); padding-top: var(--space-6); border-top: 1px solid var(--line); color: var(--quiet); font-size: var(--type-caption-size); }
@media (max-width: 47.99rem) {
  .content-card { padding: var(--space-5); }
  .footer { flex-direction: column; align-items: flex-start; gap: var(--space-2); }
}
</style>
