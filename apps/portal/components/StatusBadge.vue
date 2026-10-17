<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ label: string; tone?: "default" | "info" | "success" | "warning" | "error" | "accent"; icon?: string }>();
const toneClass = computed(() => `status-badge--${props.tone ?? "default"}`);
</script>

<template><span class="status-badge" :class="toneClass"><span v-if="props.icon" class="status-badge__icon" aria-hidden="true">{{ props.icon }}</span>{{ props.label }}</span></template>

<style scoped>
.status-badge { display: inline-flex; align-items: center; justify-content: center; width: fit-content; max-width: 100%; min-height: 24px; padding: var(--space-1) var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-pill); font-size: .72rem; font-weight: 600; white-space: nowrap; }
.status-badge--default { color: var(--muted); background: var(--surface-raised); }
.status-badge--info { color: var(--info); border-color: color-mix(in oklch, var(--info) 48%, var(--line)); background: var(--info-surface); }
.status-badge--success { color: var(--success); border-color: color-mix(in oklch, var(--success) 48%, var(--line)); background: var(--success-surface); }
.status-badge--warning { color: var(--warning); border-color: color-mix(in oklch, var(--warning) 48%, var(--line)); background: color-mix(in oklch, var(--warning) 12%, var(--surface)); }
.status-badge--error { color: var(--danger); border-color: color-mix(in oklch, var(--danger) 48%, var(--line)); background: color-mix(in oklch, var(--danger) 12%, var(--surface)); }
.status-badge--accent { color: var(--text); border-color: color-mix(in oklch, var(--accent) 30%, var(--line)); background: color-mix(in oklch, var(--accent-surface) 42%, var(--surface)); }
.status-badge__icon { margin-right: var(--space-1); color: var(--accent); }
.status-badge--default .status-badge__icon { color: var(--quiet); }
</style>
