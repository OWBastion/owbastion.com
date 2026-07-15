<script setup lang="ts">
useSeoMeta({
  title: "躲避堡垒 3 · 玩家社区",
  description: "活动、成就记录与天梯排名。",
});
</script>

<template>
  <main class="site-shell">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">《躲避堡垒 3》社区</p>
        <h1 id="hero-title">躲避堡垒 3</h1>
        <p class="hero-topic">事件 · 成就 · 天梯排名</p>
        <p class="hero-description">了解规则，完成挑战，查看公开记录。</p>
      </div>
      <aside class="focus-panel" aria-labelledby="focus-title">
        <p class="panel-eyebrow">本期焦点</p>
        <h2 id="focus-title">首个轮换挑战<br>即将开放</h2>
        <p>限时目标、参与条件和公开完成记录。</p>
        <ul><li>限时成就挑战</li><li>限时活动</li><li>公开完成记录</li></ul>
      </aside>
    </section>

    <section id="rotation" class="rotation-feature surface-card" aria-labelledby="rotation-title">
      <div class="feature-copy"><p class="eyebrow">轮换挑战</p><h2 id="rotation-title">限时目标<br>按期开放</h2><p>当前轮换挑战：未开放。</p></div>
      <div class="feature-detail"><p>首个轮换挑战：未开放。</p></div>
    </section>

    <section class="content-section" aria-labelledby="content-title">
      <div class="section-heading"><div><p class="eyebrow">社区内容</p><h2 id="content-title">游玩记录</h2></div><p>仅展示公开内容。</p></div>
      <div class="content-grid">
        <article id="events" class="content-card content-card-wide"><p class="card-label">事件</p><h3>随机事件</h3><p>已发布的随机事件与规则变化。</p></article>
        <article id="achievements" class="content-card"><p class="card-label">成就</p><h3>完成过的挑战</h3><p>玩家完成的目标与公开进度。</p></article>
        <article id="rankings" class="content-card content-card-emphasis"><p class="card-label">天梯排名</p><h3>公开记录</h3><p>挑战、完成时间与玩家排名。</p></article>
        <article class="content-card"><p class="card-label">版本记录</p><h3>版本变化</h3><p>已发布的内容与规则变化。</p></article>
      </div>
    </section>

    <footer class="footer"><span>躲避堡垒 3 社区</span><span>活动 · 成就 · 天梯排名</span><span>© {{ new Date().getFullYear() }} 躲避堡垒 3</span></footer>
  </main>
</template>

<style scoped>
.site-shell { padding: 0 clamp(18px, 5vw, 76px) 30px; }
.hero { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(320px, .72fr); align-items: center; gap: clamp(40px, 8vw, 120px); max-width: 1100px; min-height: 610px; margin: 0 auto; padding: clamp(72px, 11vh, 132px) 0 clamp(70px, 10vh, 115px); }
h1, h2, h3 { color: var(--text); font-weight: 650; letter-spacing: -.052em; }
h1 { margin: 0 0 10px; font-size: clamp(3.6rem, 8.1vw, 7.2rem); line-height: .94; }
.hero-topic { margin: 0 0 27px; font-size: clamp(1.65rem, 3vw, 2.75rem); letter-spacing: -.045em; line-height: 1.05; }
.hero-description { max-width: 45ch; margin: 0; color: var(--muted); font-size: clamp(1rem, 1.25vw, 1.1rem); line-height: 1.65; }
.focus-panel { padding: clamp(24px, 3.2vw, 34px); border: 1px solid color-mix(in oklch, var(--accent) 44%, var(--line)); border-radius: 18px; background: var(--accent-surface); }
.panel-eyebrow, .card-label { margin: 0 0 28px; color: color-mix(in oklch, var(--accent) 82%, var(--on-accent)); font-size: .72rem; font-weight: 700; letter-spacing: .05em; }
.focus-panel h2 { margin: 0 0 18px; font-size: clamp(1.85rem, 3vw, 2.65rem); line-height: 1.05; }.focus-panel > p:not(.panel-eyebrow) { margin: 0 0 25px; color: var(--text); font-size: .9rem; line-height: 1.65; }.focus-panel ul { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: .8rem; }.focus-panel li { display: flex; gap: 9px; align-items: center; }.focus-panel li::before { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); content: ""; }
.rotation-feature { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(230px, .65fr); gap: 38px; max-width: 1100px; margin: 0 auto clamp(120px, 17vw, 210px); padding: clamp(30px, 5vw, 56px); }.feature-copy h2, .section-heading h2 { margin: 0 0 18px; font-size: clamp(2.2rem, 4.4vw, 4.4rem); line-height: .98; }.feature-copy > p:last-child, .feature-detail { color: var(--muted); font-size: .9rem; line-height: 1.65; }.feature-detail { align-self: end; padding-left: 22px; border-left: 1px solid var(--line-strong); }.feature-detail p { margin: 0 0 8px; color: var(--text); font-weight: 600; }.feature-detail span { color: var(--quiet); }
.content-section { max-width: 1100px; margin: 0 auto clamp(120px, 17vw, 210px); }.section-heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(230px, .65fr); align-items: end; gap: 40px; margin-bottom: 46px; }.section-heading > p { max-width: 32ch; margin: 0 0 5px; color: var(--muted); font-size: .9rem; line-height: 1.65; }.content-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }.content-card { min-height: 220px; padding: 26px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }.content-card-wide { grid-column: span 2; min-height: 210px; }.content-card-emphasis { background: color-mix(in oklch, var(--surface-raised) 72%, var(--accent-surface)); }.card-label { margin-bottom: 48px; color: var(--accent); }.content-card h3 { max-width: 18ch; margin: 0 0 11px; font-size: clamp(1.35rem, 2.4vw, 2rem); line-height: 1.12; }.content-card p:last-child { max-width: 42ch; margin: 0; color: var(--muted); font-size: .85rem; line-height: 1.62; }
.footer { display: flex; justify-content: space-between; gap: 18px; max-width: 1280px; margin: 0 auto; padding-top: 25px; border-top: 1px solid var(--line); color: var(--quiet); font-size: .66rem; letter-spacing: .07em; }
@media (max-width: 820px) { .hero, .rotation-feature, .section-heading { grid-template-columns: 1fr; }.hero { gap: 36px; min-height: auto; }.focus-panel { max-width: 520px; }.feature-detail { padding: 22px 0 0; border-top: 1px solid var(--line-strong); border-left: 0; } } @media (max-width: 620px) { .site-shell { padding-inline: 14px; }.hero { padding-top: 70px; }.hero-copy { max-width: 35rem; }h1 { font-size: clamp(3.2rem, 16vw, 5rem); }.hero-topic { font-size: 1.65rem; }.rotation-feature { gap: 26px; padding: 25px; }.content-grid { grid-template-columns: 1fr; }.content-card-wide { grid-column: auto; }.content-card { min-height: 0; padding: 23px; }.card-label { margin-bottom: 38px; }.footer { flex-direction: column; align-items: flex-start; gap: 9px; } }
</style>
