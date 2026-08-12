<script setup lang="ts">
type Metric = { label: string; value: string; detail: string; icon: string; tone: "accent" | "warning" | "success" };

defineProps<{ metrics: Metric[] }>();
</script>

<template>
  <section class="title-migration-metrics" aria-label="称号迁移概览">
    <UCard v-for="metric in metrics" :key="metric.label" class="migration-metric" :class="`migration-metric--${metric.tone}`" variant="outline">
      <div class="migration-metric__icon" aria-hidden="true"><UIcon :name="metric.icon" /></div>
      <div>
        <p class="migration-metric__label">{{ metric.label }}</p>
        <strong class="migration-metric__value">{{ metric.value }}</strong>
        <p class="migration-metric__detail">{{ metric.detail }}</p>
      </div>
    </UCard>
  </section>
</template>

<style scoped>
.title-migration-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.migration-metric :deep([data-slot="root"]) { min-height: 128px; }
.migration-metric :deep([data-slot="body"]) { display: flex; align-items: center; gap: 16px; padding: 20px; }
.migration-metric__icon { display: grid; flex: 0 0 auto; width: 48px; height: 48px; place-items: center; border-radius: 50%; font-size: 1.35rem; }
.migration-metric--accent .migration-metric__icon { color: var(--accent); background: var(--accent-surface); }
.migration-metric--warning .migration-metric__icon { color: var(--warning); background: color-mix(in oklch, var(--warning) 16%, var(--surface)); }
.migration-metric--success .migration-metric__icon { color: var(--success); background: color-mix(in oklch, var(--success-surface) 24%, var(--surface)); }
.migration-metric__label, .migration-metric__detail { margin: 0; color: var(--quiet); font-size: .76rem; }
.migration-metric__label { font-weight: 680; }
.migration-metric__value { display: block; margin-top: 2px; font-size: clamp(1.8rem, 3vw, 2.25rem); line-height: 1.05; }
.migration-metric__detail { margin-top: 5px; }
@media (max-width: 760px) { .title-migration-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 460px) { .title-migration-metrics { grid-template-columns: 1fr; } }
</style>
