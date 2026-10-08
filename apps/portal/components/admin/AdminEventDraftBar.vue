<script setup lang="ts">
defineProps<{ count: number; summary: string; saving: boolean }>();
const emit = defineEmits<{ save: []; discard: [] }>();
</script>

<template>
  <div v-if="count" class="draft-bar" role="status">
    <strong>{{ count }} 项未保存的修改</strong>
    <span v-if="summary" class="draft-bar__summary">{{ summary }}</span>
    <span class="draft-bar__spacer" />
    <UButton label="放弃" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="emit('discard')" />
    <UButton label="保存全部" size="sm" :loading="saving" @click="emit('save')" />
  </div>
</template>

<style scoped>
.draft-bar { position: sticky; z-index: 5; top: var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid color-mix(in oklch, var(--accent) 60%, var(--line)); border-radius: var(--radius-card); background: color-mix(in oklch, var(--accent) 9%, var(--surface)); box-shadow: var(--elevation-2); }
.draft-bar__summary { color: var(--muted); font-size: var(--type-label-sm-size); }
.draft-bar__spacer { flex: 1; }
</style>
