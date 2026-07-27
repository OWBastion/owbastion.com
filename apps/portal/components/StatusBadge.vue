<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ label: string; tone?: "default" | "success" | "warning" }>();
const toneClass = computed(() => `status-badge--${props.tone ?? "default"}`);
</script>

<template><span class="status-badge" :class="toneClass">{{ props.label }}</span></template>

<style scoped>
.status-badge { display: inline-flex; align-items: center; justify-content: center; width: fit-content; max-width: 100%; min-height: 24px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: .72rem; font-weight: 680; white-space: nowrap; }
.status-badge--default { color: var(--muted); background: var(--surface-raised); }
.status-badge--success { color: var(--accent); border-color: color-mix(in oklch, var(--accent) 48%, var(--line)); background: color-mix(in oklch, var(--accent) 12%, var(--surface)); }
.status-badge--warning { color: var(--warning); border-color: color-mix(in oklch, var(--warning) 48%, var(--line)); background: color-mix(in oklch, var(--warning) 12%, var(--surface)); }
</style>
