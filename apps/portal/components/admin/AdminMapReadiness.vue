<script setup lang="ts">
defineProps<{
  problems: string[];
  assignedCount: number;
  isDefault: boolean;
  canPromote: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ promote: [] }>();
</script>

<template>
  <div class="readiness" :class="{ 'readiness--live': isDefault }" role="status">
    <ul class="readiness__items">
      <li :class="{ 'readiness__item--todo': problems.length }">
        <UIcon :name="problems.length ? 'i-lucide-circle-alert' : 'i-lucide-circle-check'" aria-hidden="true" />
        <span v-if="problems.length">{{ problems[0] }}<template v-if="problems.length > 1"> 等 {{ problems.length }} 项</template></span>
        <span v-else>点位完整</span>
      </li>
      <li :class="{ 'readiness__item--todo': !assignedCount }">
        <UIcon :name="assignedCount ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'" aria-hidden="true" />
        <span>{{ assignedCount ? `已关联 ${assignedCount} 项成就与称号` : "尚未关联成就或称号" }}</span>
      </li>
    </ul>
    <p v-if="isDefault" class="readiness__live">这是正式版：玩家的挑战、称号和精通进度都记在这里。</p>
    <UButton v-else-if="canPromote" class="pressable" label="设为正式版" color="primary" :disabled="disabled || problems.length > 0 || !assignedCount" @click="emit('promote')" />
  </div>
</template>

<style scoped>
.readiness { display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem 1.25rem; padding: 0.75rem 1rem; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.readiness--live { background: var(--success-surface); border-color: color-mix(in oklch, var(--success) 30%, var(--line)); }
.readiness__items { display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0; margin: 0; list-style: none; font-size: 0.875rem; }
.readiness__items li { display: inline-flex; align-items: center; gap: 0.375rem; color: var(--success); }
.readiness__items li.readiness__item--todo { color: var(--warning); }
.readiness__live { margin: 0; color: var(--muted); font-size: 0.875rem; }
</style>
