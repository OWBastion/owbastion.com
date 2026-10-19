<script setup lang="ts">
// Each marker sits where that information appears on the in-game screen.
const requirements = [
  { title: "通关数据与标志", description: "左上角通关数据与通关标志", x: 14, y: 16 },
  { title: "地图名称", description: "游戏右上角显示的地图名称", x: 84, y: 12 },
  { title: "游戏难度", description: "游戏右上角显示的难度标识", x: 84, y: 26 },
  { title: "相关挑战数据", description: "与挑战相关的具体数据", x: 30, y: 52 },
  { title: "游戏 ID", description: "左下角显示的玩家名称", x: 14, y: 86 },
];
</script>

<template>
  <section class="requirements" aria-labelledby="requirements-title">
    <h2 id="requirements-title" class="requirements__title">截图要包含什么</h2>
    <div class="screen" aria-hidden="true">
      <span class="screen__hud screen__hud--tl" />
      <span class="screen__hud screen__hud--tr" />
      <span class="screen__hud screen__hud--bl" />
      <span class="screen__reticle" />
      <span v-for="(item, index) in requirements" :key="item.title" class="screen__marker num" :style="{ left: `${item.x}%`, top: `${item.y}%` }">{{ index + 1 }}</span>
    </div>
    <ol class="requirement-list">
      <li v-for="(item, index) in requirements" :key="item.title">
        <span class="requirement-list__index num" aria-hidden="true">{{ index + 1 }}</span>
        <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
      </li>
    </ol>
    <p class="tip-note"><UIcon name="i-lucide-lightbulb" aria-hidden="true" />优先使用游戏内截图，避免裁剪或二次压缩。</p>
  </section>
</template>

<style scoped>
.requirements { display: grid; align-content: start; gap: var(--space-4); min-width: 0; }
.requirements__title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.screen { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: radial-gradient(60% 70% at 50% 60%, color-mix(in oklch, var(--accent) 10%, transparent), transparent 70%), linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 1.25rem 1.25rem, linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 1.25rem 1.25rem, var(--page); }
.screen__hud { position: absolute; border: 1px dashed color-mix(in oklch, var(--accent) 45%, var(--line-strong)); border-radius: calc(var(--radius-control) / 1.5); background: color-mix(in oklch, var(--accent) 6%, transparent); }
.screen__hud--tl { top: 7%; left: 4%; width: 24%; height: 20%; }
.screen__hud--tr { top: 5%; right: 4%; width: 22%; height: 28%; }
.screen__hud--bl { bottom: 6%; left: 4%; width: 22%; height: 10%; }
.screen__reticle { position: absolute; top: 50%; left: 50%; width: 1.25rem; height: 1.25rem; border: 1px solid var(--quiet); border-radius: 50%; transform: translate(-50%, -50%); }
.screen__marker { position: absolute; display: grid; width: 1.5rem; height: 1.5rem; place-items: center; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: .75rem; font-weight: 700; box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 25%, transparent); transform: translate(-50%, -50%); }
.requirement-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.requirement-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--space-3); }
.requirement-list__index { display: grid; width: 1.375rem; height: 1.375rem; place-items: center; border: 1px solid color-mix(in oklch, var(--accent) 50%, var(--line)); border-radius: 50%; color: var(--accent); font-size: .72rem; font-weight: 700; }
.requirement-list strong { display: block; font-size: var(--type-label-sm-size); font-weight: 600; }
.requirement-list small { display: block; color: var(--muted); font-size: var(--type-caption-size); line-height: 1.5; }
.tip-note { display: flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--quiet); font-size: var(--type-caption-size); line-height: 1.5; }
</style>
