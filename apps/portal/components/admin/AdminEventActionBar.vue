<script setup lang="ts">
import { statusLabels, type EventPatch } from "~/utils/event-draft";

defineProps<{ selectedCount: number; draftCount: number; summary: string; saving: boolean; versions: string[]; groups: string[] }>();
const emit = defineEmits<{ patch: [patch: EventPatch]; weight: [operation: "set" | "add" | "multiply", value: number]; clear: []; save: []; discard: [] }>();
const operation = shallowRef<"set" | "add" | "multiply">("set");
const weight = shallowRef("");
const CLEAR = "__clear";
const statusItems = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const versionItems = (versions: string[]) => versions.map((value) => ({ value, label: value }));
const groupItems = (groups: string[]) => [...groups.map((value) => ({ value, label: value })), { value: CLEAR, label: "清除事件组" }];
const applyWeight = () => { const value = Number(weight.value); if (weight.value !== "" && Number.isFinite(value)) emit("weight", operation.value, value); };
</script>

<template>
  <div v-if="selectedCount || draftCount" class="action-bar" :class="{ 'action-bar--draft': draftCount }">
    <span class="action-bar__status" role="status">
      <strong v-if="selectedCount">已选 {{ selectedCount }} 项</strong>
      <strong v-if="draftCount">{{ draftCount }} 项未保存的修改</strong>
      <span v-if="draftCount && summary" class="action-bar__summary">{{ summary }}</span>
    </span>
    <template v-if="selectedCount">
      <USelect :model-value="undefined" :items="statusItems" size="md" placeholder="设为状态…" aria-label="设为状态" @update:model-value="(value) => emit('patch', { releaseStatus: value as 'implemented' })" />
      <USelect :model-value="undefined" :items="versionItems(versions)" size="md" placeholder="移到版本…" aria-label="移到版本" @update:model-value="(value) => emit('patch', { gameVersion: String(value) })" />
      <USelect :model-value="undefined" :items="groupItems(groups)" size="md" placeholder="设事件组…" aria-label="设事件组" @update:model-value="(value) => emit('patch', { eventGroup: value === CLEAR ? null : String(value) })" />
      <span class="action-bar__weight" role="group" aria-label="批量调整权重">
        <UButton v-for="[value, label] in ([['set', '权重＝'], ['add', '＋'], ['multiply', '×']] as const)" :key="value" :label="label" size="md" :color="operation === value ? 'primary' : 'neutral'" :variant="operation === value ? 'soft' : 'outline'" :aria-pressed="operation === value" @click="operation = value" />
        <UInput v-model="weight" class="action-bar__value" type="number" step="0.05" size="md" placeholder="数值" aria-label="权重数值" @keydown.enter.prevent="applyWeight" />
        <UButton label="应用" color="neutral" variant="outline" size="sm" @click="applyWeight" />
      </span>
    </template>
    <span class="action-bar__spacer" />
    <UButton v-if="selectedCount && !draftCount" label="取消选择" color="neutral" variant="ghost" size="sm" @click="emit('clear')" />
    <template v-if="draftCount">
      <UButton label="放弃" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="emit('discard')" />
      <UButton label="保存全部" size="sm" :loading="saving" @click="emit('save')" />
    </template>
  </div>
</template>

<style scoped>
.action-bar { position: sticky; z-index: 5; top: var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface-raised); }
.action-bar--draft { border-color: color-mix(in oklch, var(--accent) 60%, var(--line)); background: color-mix(in oklch, var(--accent) 9%, var(--surface)); box-shadow: var(--elevation-2); }
.action-bar__status { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); }
.action-bar__summary { color: var(--muted); font-size: var(--type-label-sm-size); }
.action-bar__spacer { flex: 1; }
.action-bar__weight { display: inline-flex; align-items: center; gap: var(--space-1); }
.action-bar__value { width: 5.5rem; }
</style>
