<script setup lang="ts">
defineProps<{ label: string; value: string | number | null }>();
</script>

<template>
  <div class="stat">
    <span class="stat__value num">{{ value ?? "—" }}</span>
    <span class="stat__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.stat { display: grid; min-width: 6.5rem; gap: 2px; padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); }
.stat__value { color: var(--text); font-size: 1.5rem; font-weight: 700; line-height: 1.1; }
.stat__label { color: var(--quiet); font-size: var(--type-caption-size); }
</style>
