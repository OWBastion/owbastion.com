<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";

const props = withDefaults(defineProps<{ title: OwnedTitle; variant?: "slot" | "tile" }>(), { variant: "slot" });
const emit = defineEmits<{ inspect: [title: OwnedTitle] }>();
const { style, active, handlers } = useIconTilt(props.variant === "tile" ? 14 : 8);
const meta = computed(() => props.title.mapName ?? (props.title.scope === "global" ? props.title.category : ""));
</script>

<template>
  <button type="button" class="title-badge pressable-soft" :class="`title-badge--${variant}`" :aria-label="`${title.label}，查看详情`" @click="emit('inspect', title)">
    <span class="title-badge__face" :class="{ 'is-tilting': active }" :style="style" v-on="handlers">
      <PlayerTitleMark :title="title" />
      <span v-if="variant === 'slot'" class="title-badge__copy">
        <strong>{{ title.label }}</strong>
        <small v-if="meta">{{ meta }}</small>
      </span>
    </span>
  </button>
</template>

<style scoped>
.title-badge { display: inline-flex; min-width: 0; max-width: 100%; padding: 0; border: 0; color: inherit; background: none; font: inherit; text-align: left; cursor: pointer; }
.title-badge:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; border-radius: var(--radius-control); }
.title-badge__face { position: relative; display: inline-flex; min-width: 0; align-items: center; gap: var(--space-3); border-radius: var(--radius-control); transform: perspective(40rem) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)); transition: transform .45s ease-out; }
.title-badge__face.is-tilting { transition: transform .08s linear; }
/* Glare follows the pointer; it only exists while the icon is being tilted. */
.title-badge__face::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 30%), color-mix(in oklch, var(--text) 24%, transparent), transparent 58%); opacity: 0; transition: opacity .2s ease-out; }
.title-badge__face.is-tilting::after { opacity: 1; }
.title-badge--slot .title-badge__face { padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2); border: 1px solid var(--line); background: color-mix(in oklch, var(--surface) 70%, transparent); }
.title-badge--slot { --mark-size: 2.5rem; }
.title-badge--tile { --mark-size: 2.5rem; }
.title-badge__copy { display: grid; min-width: 0; }
.title-badge__copy strong { overflow: hidden; color: var(--text); font-size: var(--type-label-size); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.title-badge__copy small { overflow: hidden; color: var(--quiet); font-size: var(--type-caption-size); text-overflow: ellipsis; white-space: nowrap; }
@media (pointer: coarse) { .title-badge--tile { --mark-size: 2.75rem; } }
@media (prefers-contrast: more) { .title-badge--slot .title-badge__face { border-color: var(--text); } }
</style>
