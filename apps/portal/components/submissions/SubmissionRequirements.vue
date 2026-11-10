<script setup lang="ts">
// Region follows ocrkit layout 1280x720-v10: the completion card at the top centre carries every required field.
const marks = [
  { label: "挑战完成卡", x: 25.8, y: 6.9, w: 48.4, h: 15.3 },
];
</script>

<template>
  <figure class="screen" aria-label="截图需包含：画面顶部的挑战完成卡">
    <span v-for="mark in marks" :key="mark.label" class="screen__mark" :style="{ left: `${mark.x}%`, top: `${mark.y}%`, width: `${mark.w}%`, height: `${mark.h}%` }">{{ mark.label }}</span>
  </figure>
</template>

<style scoped>
.screen { position: relative; aspect-ratio: 16 / 9; margin: 0; overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 1rem 1rem, linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 1rem 1rem, var(--page); }
.screen__mark { position: absolute; display: grid; place-items: center; border: 1px dashed color-mix(in oklch, var(--accent) 55%, var(--line-strong)); border-radius: calc(var(--radius-control) / 1.5); background: color-mix(in oklch, var(--accent) 8%, transparent); color: var(--accent); font-size: var(--type-caption-size); font-weight: 600; white-space: nowrap; }
</style>
