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
/* Hover lifts the badge and opens its ring; locked art warms up slightly so the tap target reads as live. */
.tile:hover :deep(.achievement-icon), .tile:focus-visible :deep(.achievement-icon) { transform: translateY(-3px) scale(1.06); }
.tile:hover :deep(.achievement-icon::before), .tile:focus-visible :deep(.achievement-icon::before) { transform: scale(1.1) rotate(30deg); }
.tile.is-earned:hover :deep(.achievement-icon img), .tile.is-earned:focus-visible :deep(.achievement-icon img) { filter: drop-shadow(0 .5rem .75rem color-mix(in oklch, var(--accent) 40%, transparent)); }
.tile:not(.is-earned):hover :deep(.achievement-icon img), .tile:not(.is-earned):hover :deep(.achievement-icon svg) { opacity: .7; }
@media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile :deep(.achievement-icon), .tile :deep(.achievement-icon::before) { transform: none !important; } }
</style>
