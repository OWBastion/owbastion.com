<script setup lang="ts">
export type ProfileStat = { label: string; value: string; unit?: string };

defineProps<{ stats: ProfileStat[] }>();
</script>

<template>
  <dl class="stat-sheet">
    <div v-for="stat in stats" :key="stat.label" class="stat-sheet__item">
      <dt>{{ stat.label }}</dt>
      <dd class="num">{{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small></dd>
    </div>
  </dl>
</template>

<style scoped>
.stat-sheet { container-type: inline-size; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--line); }
.stat-sheet__item { display: grid; grid-template-areas: "value" "label"; gap: var(--space-1); padding: var(--space-3) var(--space-4); background: var(--surface); }
.stat-sheet__item dd { grid-area: value; margin: 0; color: var(--text); font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.stat-sheet__item small { margin-left: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.stat-sheet__item dt { grid-area: label; color: var(--muted); font-size: var(--type-label-sm-size); }
@media (prefers-contrast: more) { .stat-sheet { border-color: var(--text); } }
</style>
