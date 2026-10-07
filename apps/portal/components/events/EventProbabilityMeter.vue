<script setup lang="ts">
import { formatProbability } from "~/utils/event-probabilities";

// The bar is relative to the most likely event, so cards compare at a glance; the number stays absolute.
const props = defineProps<{ probability: number | null; max: number; label?: string }>();
const ratio = computed(() => props.probability === null || props.max <= 0 ? 0 : Math.min(1, props.probability / props.max));
</script>

<template>
  <div v-if="probability !== null" class="probability-meter" role="img" :aria-label="`${label ?? '出现概率'} ${formatProbability(probability)}`">
    <span v-if="label" class="probability-meter__label">{{ label }}</span>
    <span class="probability-meter__track"><i :style="{ width: `${Math.max(2, ratio * 100)}%` }" /></span>
    <span class="probability-meter__value num">{{ formatProbability(probability) }}</span>
  </div>
</template>

<style scoped>
.probability-meter { display: flex; align-items: center; gap: var(--space-2); min-width: 0; color: var(--muted); font-size: var(--type-caption-size); }
.probability-meter__track { flex: 1; min-width: 2rem; height: 0.375rem; overflow: hidden; border-radius: var(--radius-pill); background: var(--line); }
.probability-meter__track i { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
.probability-meter__value { min-width: 3rem; color: var(--text); font-weight: 600; text-align: right; }
</style>
