<script setup lang="ts">
useSeoMeta({
  title: "躲避堡垒 3 · 玩家社区",
  description: "活动、成就记录与地图。",
});
</script>

<template>
  <main class="home-page page-shell--readable">
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
      <h2 id="content-title" class="type-title">游玩记录</h2>
      <div class="content-grid">
        <NuxtLink id="events" to="/events" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">随机事件</h3>
          <p>已发布的随机事件与规则变化。</p>
        </NuxtLink>
        <NuxtLink id="achievements" to="/achievements" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">成就挑战</h3>
          <p>查看已发布的目标与完成条件。</p>
        </NuxtLink>
        <NuxtLink to="/changelog" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">版本更新</h3>
          <p>已发布的内容与规则变化。</p>
        </NuxtLink>
        <NuxtLink to="/blog" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">开发日志</h3>
          <p>阅读开发进展与设计记录。</p>
        </NuxtLink>
      </div>
    </section>

    <footer class="footer">
      <span>躲避堡垒 3 社区</span>
      <nav class="footer-nav" aria-label="页脚导航">
        <NuxtLink to="/changelog" class="footer-link pressable">版本更新</NuxtLink>
        <NuxtLink to="/blog" class="footer-link pressable">开发日志</NuxtLink>
      </nav>
      <span>© {{ new Date().getFullYear() }} 躲避堡垒 3</span>
    </footer>
  </main>
</template>

<style scoped>
.home-page { padding-block: clamp(3.5rem, 9vh, 6rem) 2.5rem; }
.hero { padding-block: clamp(3rem, 8vh, 5.5rem) clamp(3.5rem, 9vh, 6rem); }
.hero h1 { margin-bottom: 0.875rem; }
.hero-topic { margin: 0; color: var(--muted); }
.rotation-status { margin-bottom: clamp(4.5rem, 12vw, 8.75rem); padding: 1.125rem 1.5rem; color: var(--muted); font-size: .85rem; }
.rotation-status p { margin: 0; }
.content-section { margin-bottom: clamp(4.5rem, 12vw, 8.75rem); }
.content-section > .type-title { margin-bottom: 2.125rem; }
.content-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.content-card { display: grid; min-height: 200px; align-content: start; padding: 26px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: inherit; text-decoration: none; }
.content-card .type-headline { max-width: 18ch; margin-bottom: 11px; }
.content-card p:last-child { max-width: 42ch; margin: 0; color: var(--muted); font-size: .85rem; line-height: 1.62; }
.content-card--link.interactive-card:hover,
.content-card--link.interactive-card:focus-visible {
  border-color: color-mix(in oklch, var(--accent) 42%, var(--line-strong));
  background: color-mix(in oklch, var(--surface) 88%, var(--accent-surface));
}
.footer { display: flex; justify-content: space-between; gap: 18px; padding-top: 25px; border-top: 1px solid var(--line); color: var(--quiet); font-size: var(--type-caption-size); }
.footer-nav { display: flex; align-items: center; gap: 1.125rem; }
.footer-link { color: var(--quiet); text-decoration: none; }
.footer-link:hover, .footer-link:focus-visible { color: var(--text); }
@media (max-width: 620px) { .content-grid { grid-template-columns: 1fr; }.content-card { min-height: 0; padding: 23px; }.footer { flex-direction: column; align-items: flex-start; gap: 9px; } }
</style>
