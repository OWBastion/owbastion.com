<script setup lang="ts">
import { useSeoMeta } from "#imports";

useSeoMeta({
  title: "OWBastion · Bastion 生态平台",
  description: "OWBastion Bastion 生态的公共入口。",
});
</script>

<template>
  <main class="site-shell">
    <header class="masthead">
      <a class="wordmark" href="/" aria-label="OWBastion 首页">
        <span class="wordmark-mark" aria-hidden="true">O</span>
        <span>OWBastion</span>
      </a>
      <span class="status-label"><span class="status-dot" />平台正在搭建</span>
    </header>

    <section class="hero" aria-labelledby="hero-title">
      <p class="eyebrow">Bastion / Web Platform</p>
      <h1 id="hero-title">把每一次<br /><em>游玩记录</em>留下来。</h1>
      <p class="hero-copy">
        这里将成为 Bastion 玩家、开发者与维护者共享的公共入口。版本数据、挑战记录和社区工具，正在被整理成一个更清晰的地方。
      </p>
      <div class="hero-actions">
        <a class="primary-link" href="https://github.com/OWBastion" rel="noreferrer">查看项目 <span aria-hidden="true">↗</span></a>
        <span class="build-note">PUBLIC PORTAL / 001</span>
      </div>
    </section>

    <section class="signal-grid" aria-label="平台组成">
      <article class="signal signal-featured">
        <span class="signal-index">01</span>
        <h2>玩家数据</h2>
        <p>让挑战、提交与进度拥有可追溯的记录。</p>
      </article>
      <article class="signal">
        <span class="signal-index">02</span>
        <h2>公开版本</h2>
        <p>以 Bastion 发布快照作为公开内容的依据。</p>
      </article>
      <article class="signal">
        <span class="signal-index">03</span>
        <h2>协作工具</h2>
        <p>把审核、草稿与变更编排放在清晰的边界内。</p>
      </article>
    </section>

    <footer class="footer">
      <span>OWBASTION.CODES</span>
      <span>© {{ new Date().getFullYear() }} OWBastion</span>
    </footer>
  </main>
</template>

<style>
:root {
  --ink: oklch(18% 0.02 175);
  --paper: oklch(94% 0.025 80);
  --paper-deep: oklch(88% 0.035 80);
  --muted: oklch(45% 0.025 175);
  --line: oklch(18% 0.02 175 / 18%);
  --accent: oklch(61% 0.16 38);
  --serif: Georgia, "Times New Roman", "Noto Serif SC", serif;
  --sans: "Avenir Next", "Noto Sans CJK SC", "PingFang SC", sans-serif;
}

* { box-sizing: border-box; }

html { background: var(--paper); }

body {
  margin: 0;
  min-width: 320px;
  color: var(--ink);
  background: var(--paper);
  font-family: var(--sans);
  font-kerning: normal;
}

a { color: inherit; }

.site-shell {
  display: flex;
  min-height: 100svh;
  flex-direction: column;
  overflow: hidden;
  padding: 24px clamp(20px, 5vw, 72px) 28px;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-position: center;
  background-size: 64px 64px;
}

.masthead, .footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.wordmark { display: inline-flex; align-items: center; gap: 10px; font-size: 1rem; font-weight: 700; letter-spacing: -0.04em; text-decoration: none; }
.wordmark-mark { display: grid; width: 30px; height: 30px; place-items: center; color: var(--paper); background: var(--ink); border-radius: 50%; font-family: var(--serif); font-size: 1.2rem; font-weight: 400; }
.status-label, .build-note, .eyebrow, .signal-index, .footer { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; }
.status-label { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px oklch(61% 0.16 38 / 18%); }

.hero { width: min(100%, 980px); margin: clamp(92px, 15vh, 170px) auto clamp(90px, 13vh, 140px); }
.eyebrow { margin: 0 0 24px; color: var(--accent); font-weight: 700; }
h1 { max-width: 820px; margin: 0; font-family: var(--serif); font-size: clamp(3.6rem, 9vw, 8.5rem); font-weight: 400; letter-spacing: -0.08em; line-height: 0.9; }
h1 em { color: var(--accent); font-style: italic; }
.hero-copy { max-width: 42ch; margin: 40px 0 0; color: var(--muted); font-size: clamp(1rem, 1.5vw, 1.2rem); line-height: 1.7; }
.hero-actions { display: flex; align-items: center; gap: 24px; margin-top: 36px; }
.primary-link { display: inline-flex; min-height: 48px; align-items: center; gap: 20px; padding: 0 18px; color: var(--paper); background: var(--ink); font-size: 0.85rem; font-weight: 700; text-decoration: none; transition: background 180ms ease, transform 180ms ease; }
.primary-link:hover, .primary-link:focus-visible { background: var(--accent); transform: translateY(-2px); }
.primary-link:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
.build-note { color: var(--muted); }

.signal-grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr; border-top: 1px solid var(--ink); }
.signal { min-height: 190px; padding: 20px 24px 20px 0; border-right: 1px solid var(--line); }
.signal + .signal { padding-left: 24px; }
.signal:last-child { border-right: 0; }
.signal-featured { background: var(--accent); padding-right: 32px; padding-left: 24px; color: var(--paper); }
.signal-index { display: block; margin-bottom: 56px; opacity: 0.7; }
.signal h2 { margin: 0 0 12px; font-family: var(--serif); font-size: 1.65rem; font-weight: 400; }
.signal p { max-width: 22ch; margin: 0; font-size: 0.9rem; line-height: 1.6; opacity: 0.78; }
.footer { margin-top: auto; padding-top: 28px; color: var(--muted); }

@media (max-width: 700px) {
  .site-shell { padding-inline: 20px; background-size: 48px 48px; }
  .status-label { font-size: 0.6rem; }
  .hero { margin-top: 100px; }
  .hero-actions { align-items: flex-start; flex-direction: column; gap: 16px; }
  .signal-grid { grid-template-columns: 1fr; }
  .signal, .signal + .signal, .signal-featured { min-height: auto; padding: 20px 0; border-right: 0; border-bottom: 1px solid var(--line); }
  .signal-featured { padding-inline: 20px; }
  .signal-index { margin-bottom: 28px; }
  .footer { align-items: flex-start; flex-direction: column; gap: 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .primary-link { transition: none; }
}
</style>
