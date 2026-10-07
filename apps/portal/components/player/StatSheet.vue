<script setup lang="ts">
export type ProfileStat = { label: string; value: string; unit?: string };

defineProps<{ stats: ProfileStat[] }>();
</script>

<template>
  <div class="stat-sheet-host">
    <dl class="stat-sheet" :style="{ '--stat-count': stats.length }">
      <div v-for="stat in stats" :key="stat.label" class="stat-sheet__item">
        <dt>{{ stat.label }}</dt>
        <dd class="num">{{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small></dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
/* The host is the size container; the grid itself is never a container, so its tracks never depend on a cyclic percentage. */
.stat-sheet-host { container-type: inline-size; width: 100%; min-width: 0; }
.stat-sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--line); }
.stat-sheet__item { display: grid; grid-template-areas: "value" "label"; min-width: 0; gap: var(--space-1); padding: var(--space-3) var(--space-4); background: var(--surface); }
.stat-sheet__item dd { grid-area: value; margin: 0; color: var(--text); font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.stat-sheet__item small { margin-left: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.stat-sheet__item dt { grid-area: label; color: var(--muted); font-size: var(--type-label-sm-size); }
@container (min-width: 36rem) { .stat-sheet { grid-template-columns: repeat(var(--stat-count, 4), minmax(0, 1fr)); } }
@media (prefers-contrast: more) { .stat-sheet { border-color: var(--text); } }
</style>
