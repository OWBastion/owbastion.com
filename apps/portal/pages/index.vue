<script setup lang="ts">
useSeoMeta({
  title: "躲避堡垒 3 · 玩家社区",
  description: "活动、成就记录与天梯排名。",
});
</script>

<template>
  <main class="home-page page-shell--readable">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <h1 id="hero-title" class="type-display">躲避堡垒 3</h1>
        <p class="type-title hero-topic">事件 · 成就 · 天梯排名</p>
      </div>
    </section>

    <section id="rotation" class="rotation-feature surface-card" aria-labelledby="rotation-title">
      <div class="feature-copy">
        <h2 id="rotation-title" class="type-title">轮换挑战</h2>
        <p>限时目标按期开放，首个轮换挑战当前未开放。</p>
      </div>
      <div class="feature-detail">
        <p>限时成就挑战</p>
        <p>限时活动</p>
        <p>公开完成记录</p>
      </div>
    </section>

    <section class="content-section" aria-labelledby="content-title">
      <h2 id="content-title" class="type-title">游玩记录</h2>
      <div class="content-grid">
        <article id="events" class="content-card content-card-wide interactive-card--static">
          <h3 class="type-headline">随机事件</h3>
          <p>已发布的随机事件与规则变化。</p>
        </article>
        <NuxtLink id="achievements" to="/achievements" class="content-card content-card--link interactive-card pressable-soft">
          <h3 class="type-headline">成就挑战</h3>
          <p>查看已发布的目标与完成条件。</p>
        </NuxtLink>
        <article id="rankings" class="content-card content-card-emphasis interactive-card--static">
          <h3 class="type-headline">公开记录</h3>
          <p>挑战、完成时间与玩家排名。</p>
        </article>
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
.home-page { padding-block: clamp(56px, 9vh, 96px) 40px; }
.hero { padding-block: clamp(48px, 8vh, 88px) clamp(56px, 9vh, 96px); }
.hero h1 { margin-bottom: 14px; }
.hero-topic { margin: 0; color: var(--muted); }
.rotation-feature { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(230px, .65fr); gap: 38px; margin-bottom: clamp(72px, 12vw, 140px); padding: clamp(30px, 5vw, 56px); }
.rotation-feature .type-title { margin-bottom: 18px; }
.feature-copy > p:last-child { margin: 0; color: var(--muted); font-size: .9rem; line-height: 1.65; }
.feature-detail { align-self: end; padding-left: 22px; border-left: 1px solid var(--line-strong); }
.feature-detail p { margin: 0 0 8px; color: var(--text); font-weight: 600; }
.content-section { margin-bottom: clamp(72px, 12vw, 140px); }
.content-section > .type-title { margin-bottom: 34px; }
.content-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.content-card { display: grid; min-height: 200px; align-content: start; padding: 26px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: inherit; text-decoration: none; }
.content-card-wide { grid-column: span 2; min-height: 180px; }
.content-card-emphasis { background: color-mix(in oklch, var(--surface-raised) 72%, var(--accent-surface)); }
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
@media (max-width: 820px) { .rotation-feature { grid-template-columns: 1fr; gap: 24px; }.feature-detail { padding: 18px 0 0; border-top: 1px solid var(--line-strong); border-left: 0; } }
@media (max-width: 620px) { .content-grid { grid-template-columns: 1fr; }.content-card-wide { grid-column: auto; }.content-card { min-height: 0; padding: 23px; }.footer { flex-direction: column; align-items: flex-start; gap: 9px; } }
</style>
