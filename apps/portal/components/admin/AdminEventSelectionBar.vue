<script setup lang="ts">
import type { EventPatch } from "~/utils/event-draft";

defineProps<{ count: number; versions: string[]; groups: string[] }>();
const emit = defineEmits<{ patch: [patch: EventPatch]; weight: [operation: "set" | "add" | "multiply", value: number]; clear: [] }>();
const operation = shallowRef<"set" | "add" | "multiply">("set");
const weight = shallowRef<number | string>("");
const pick = (event: Event, apply: (value: string) => void) => { const select = event.target as HTMLSelectElement; if (select.value) apply(select.value); select.value = ""; };
const applyWeight = () => { const value = Number(weight.value); if (weight.value !== "" && Number.isFinite(value)) emit("weight", operation.value, value); };
</script>

<template>
  <div v-if="count" class="selection-bar">
    <strong>已选 {{ count }} 项</strong>
    <select class="native-field" aria-label="设为状态" @change="pick($event, (value) => emit('patch', { releaseStatus: value as 'implemented' }))">
      <option value="">设为状态…</option><option value="implemented">已实装</option><option value="development">开发中</option><option value="removed">已移除</option>
    </select>
    <select class="native-field" aria-label="移到版本" @change="pick($event, (value) => emit('patch', { gameVersion: value }))">
      <option value="">移到版本…</option><option v-for="version in versions" :key="version">{{ version }}</option>
    </select>
    <select class="native-field" aria-label="设事件组" @change="pick($event, (value) => emit('patch', { eventGroup: value === '__clear' ? null : value }))">
      <option value="">设事件组…</option><option v-for="group in groups" :key="group">{{ group }}</option><option value="__clear">清除事件组</option>
    </select>
    <span class="selection-bar__weight" role="group" aria-label="批量调整权重">
      <button v-for="[value, label] in ([['set', '权重＝'], ['add', '＋'], ['multiply', '×']] as const)" :key="value" type="button" class="native-field selection-bar__op" :aria-pressed="operation === value" @click="operation = value">{{ label }}</button>
      <input v-model="weight" class="native-field selection-bar__value" type="number" step="0.05" placeholder="数值" aria-label="权重数值" @keydown.enter.prevent="applyWeight">
      <UButton label="应用" color="neutral" variant="outline" size="sm" @click="applyWeight" />
    </span>
    <span class="selection-bar__spacer" />
    <UButton label="取消选择" color="neutral" variant="ghost" size="sm" @click="emit('clear')" />
  </div>
</template>

<style scoped>
.selection-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface-raised); }
.selection-bar__spacer { flex: 1; }
.selection-bar__weight { display: inline-flex; align-items: center; gap: var(--space-1); }
.selection-bar__op { min-width: 2.5rem; cursor: pointer; }
.selection-bar__op[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-surface); color: var(--accent); font-weight: 600; }
.selection-bar__value { width: 5.5rem; }
</style>
