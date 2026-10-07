<script setup lang="ts">
import { randomEventRarityForWeight } from "@owbastion/domain";
import type { EventPatch } from "~/utils/event-draft";

export type EventFieldValues = { name: string; eventGroup: string | null; category: string; gameVersion: string; releaseStatus: "development" | "implemented" | "removed"; weight: number | null; durationSeconds: number | null; cooldownSeconds: number | null; description: string; effectTags: string[] };

const props = defineProps<{ values: EventFieldValues; groups: string[]; categories: string[]; versions: string[]; tags: string[]; disabled?: boolean }>();
const emit = defineEmits<{ patch: [patch: EventPatch] }>();
const rarity = computed(() => randomEventRarityForWeight(props.values.weight) || "—");
const numberOrNull = (value: string) => value === "" ? null : Number(value);
const tagsModel = computed({ get: () => props.values.effectTags, set: (value: string[]) => emit("patch", { effectTags: value.map((tag) => tag.trim()).filter(Boolean) }) });
</script>

<template>
  <div class="event-fields">
    <UFormField label="名称"><UInput :model-value="values.name" required class="w-full" :disabled="disabled" @change="emit('patch', { name: ($event.target as HTMLInputElement).value })" /></UFormField>
    <div class="event-fields__pair">
      <UFormField label="事件组"><UInputMenu :model-value="values.eventGroup ?? ''" :items="groups" create-item clear placeholder="选择或输入" class="w-full" :disabled="disabled" @update:model-value="emit('patch', { eventGroup: $event || null })" @create="emit('patch', { eventGroup: $event.trim() || null })" @clear="emit('patch', { eventGroup: null })" /></UFormField>
      <UFormField label="类别"><UInputMenu :model-value="values.category" :items="categories" create-item placeholder="选择或输入" class="w-full" :disabled="disabled" required @update:model-value="emit('patch', { category: $event })" @create="emit('patch', { category: $event.trim() })" /></UFormField>
    </div>
    <div class="event-fields__pair">
      <UFormField label="版本"><USelect :model-value="values.gameVersion" :items="versions" class="w-full" :disabled="disabled" @update:model-value="emit('patch', { gameVersion: $event })" /></UFormField>
      <UFormField label="状态"><USelect :model-value="values.releaseStatus" :items="[{ label: '开发中', value: 'development' }, { label: '已实装', value: 'implemented' }, { label: '已移除', value: 'removed' }]" class="w-full" :disabled="disabled" @update:model-value="emit('patch', { releaseStatus: $event as EventFieldValues['releaseStatus'] })" /></UFormField>
    </div>
    <div class="event-fields__pair">
      <UFormField label="权重" :hint="`稀有度：${rarity}`"><UInput :model-value="values.weight ?? undefined" type="number" step="0.05" min="0" class="w-full" :disabled="disabled" @input="emit('patch', { weight: numberOrNull(($event.target as HTMLInputElement).value) })" /></UFormField>
      <UFormField label="持续时间（秒）"><UInput :model-value="values.durationSeconds ?? undefined" type="number" min="0" class="w-full" :disabled="disabled" @change="emit('patch', { durationSeconds: numberOrNull(($event.target as HTMLInputElement).value) })" /></UFormField>
    </div>
    <UFormField label="内置冷却（秒）"><UInput :model-value="values.cooldownSeconds ?? undefined" type="number" min="0" class="w-full" :disabled="disabled" @change="emit('patch', { cooldownSeconds: numberOrNull(($event.target as HTMLInputElement).value) })" /></UFormField>
    <UFormField label="内容说明"><UTextarea :model-value="values.description" :rows="4" required class="w-full" :disabled="disabled" @change="emit('patch', { description: ($event.target as HTMLTextAreaElement).value })" /></UFormField>
    <UFormField label="效果标签"><UInputMenu v-model="tagsModel" :items="tags" multiple create-item placeholder="输入或选择效果标签" aria-label="效果标签" class="w-full" :disabled="disabled" /></UFormField>
  </div>
</template>

<style scoped>
.event-fields { container-type: inline-size; display: grid; gap: var(--space-3); min-width: 0; }
.event-fields__pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
@container (max-width: 23.99rem) { .event-fields__pair { grid-template-columns: minmax(0, 1fr); } }
</style>
