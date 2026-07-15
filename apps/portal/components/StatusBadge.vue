<script setup lang="ts">
defineProps<{ label: string; tone?: "default" | "success" | "warning" }>();
</script>

<template><span class="status-badge" :class="`tone-${tone ?? 'default'}`">{{ label }}</span></template>

<style scoped>
.status-badge { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--surface-raised); font-size: .72rem; font-weight: 680; }
.tone-success { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--accent); }
.tone-warning { color: var(--warning); }
</style>
