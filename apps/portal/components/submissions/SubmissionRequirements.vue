<script setup lang="ts">
// Each label sits where that information appears on the in-game screen.
const marks = [
  { label: "通关数据", x: 4, y: 7, w: 26, h: 22 },
  { label: "地图 · 难度", x: 72, y: 5, w: 24, h: 28 },
  { label: "游戏 ID", x: 4, y: 82, w: 22, h: 12 },
];
</script>

<template>
  <figure class="screen" aria-label="截图需包含：通关数据、地图、难度、游戏 ID">
    <span v-for="mark in marks" :key="mark.label" class="screen__mark" :style="{ left: `${mark.x}%`, top: `${mark.y}%`, width: `${mark.w}%`, height: `${mark.h}%` }">{{ mark.label }}</span>
  </figure>
</template>

<style scoped>
.screen { position: relative; aspect-ratio: 16 / 9; margin: 0; overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 1rem 1rem, linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 1rem 1rem, var(--page); }
.screen__mark { position: absolute; display: grid; place-items: center; border: 1px dashed color-mix(in oklch, var(--accent) 55%, var(--line-strong)); border-radius: calc(var(--radius-control) / 1.5); background: color-mix(in oklch, var(--accent) 8%, transparent); color: var(--accent); font-size: var(--type-caption-size); font-weight: 600; white-space: nowrap; }
</style>
