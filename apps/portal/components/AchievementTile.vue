<script setup lang="ts">
defineProps<{ name: string; iconUrl?: string | null; icon: string; earned: boolean; checked?: boolean; checkLabel?: string; highlighted?: boolean }>();
</script>

<template>
  <button type="button" class="tile" :class="{ 'is-earned': earned, 'is-highlighted': highlighted }">
    <AchievementIcon :url="iconUrl" :icon="icon" :earned="earned" />
    <span class="tile__name">{{ name }}</span>
    <UIcon v-if="checked" name="i-lucide-check" class="tile__check" :aria-label="checkLabel" />
  </button>
</template>

<style scoped>
.tile { position: relative; display: grid; justify-items: center; gap: var(--space-2); width: 100%; padding: var(--space-4) var(--space-2) var(--space-3); border: 1px solid transparent; border-radius: var(--radius-card); background: none; color: var(--quiet); cursor: pointer; transition: background-color 160ms ease, border-color 160ms ease; }
.tile:hover, .tile:focus-visible { border-color: var(--line); background: var(--surface); }
.tile.is-earned { color: var(--text); }
.tile.is-highlighted { border-color: color-mix(in oklch, var(--accent) 55%, var(--line)); }
.tile__name { overflow: hidden; max-width: 100%; font-size: var(--type-label-sm-size); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.tile__check { position: absolute; top: var(--space-2); right: var(--space-2); color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .tile { transition: none; } }
</style>
