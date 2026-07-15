<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template><section class="empty-state surface-card"><h2>{{ title }}</h2><p v-if="description">{{ description }}</p><slot /></section></template>

<style scoped>
.empty-state { padding: clamp(24px, 4vw, 38px); }
h2 { margin: 0 0 8px; font-size: 1.15rem; letter-spacing: -.025em; }
h2:last-child { margin-bottom: 0; }
p { max-width: 48ch; margin: 0; color: var(--muted); line-height: 1.6; }
</style>
