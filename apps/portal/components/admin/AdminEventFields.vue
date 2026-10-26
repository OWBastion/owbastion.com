<script setup lang="ts">
import { randomEventCompositeCategory, randomEventOutcomesValid, randomEventRarityForWeight } from "@owbastion/domain";
import type { EventOutcome } from "~/types/random-event";
import { statusLabels, type EventPatch } from "~/utils/event-draft";

export type EventFieldValues = { name: string; eventGroup: string | null; category: string; gameVersion: string; releaseStatus: "development" | "implemented" | "removed"; weight: number | null; durationSeconds: number | null; cooldownSeconds: number | null; description: string; effectTags: string[]; outcomes: EventOutcome[] };

const props = defineProps<{ values: EventFieldValues; groups: string[]; categories: string[]; versions: string[]; tags: string[]; disabled?: boolean }>();
const emit = defineEmits<{ patch: [patch: EventPatch] }>();
const rarity = computed(() => randomEventRarityForWeight(props.values.weight) || "—");
const statusItems = (["development", "implemented", "removed"] as const).map((value) => ({ label: statusLabels[value], value }));
const numberOrNull = (value: string) => value === "" ? null : Number(value);
const tagsModel = computed({ get: () => props.values.effectTags, set: (value: string[]) => emit("patch", { effectTags: value.map((tag) => tag.trim()).filter(Boolean) }) });

// Leaving 复合 clears the staged outcome set so the saved result stays valid.
const patchCategory = (category: string) => emit("patch", props.values.outcomes.length && category !== randomEventCompositeCategory ? { category, outcomes: [] } : { category });
const polarityItems = [{ label: "增益", value: "buff" }, { label: "减益", value: "debuff" }];
const emitOutcomes = (rows: EventOutcome[]) => emit("patch", { outcomes: rows.map((row, position) => ({ ...row, position })) });
const setOutcome = (index: number, patch: Partial<EventOutcome>) => emitOutcomes(props.values.outcomes.map((row, item) => item === index ? { ...row, ...patch } : row));
const addOutcome = () => emitOutcomes([...props.values.outcomes, { position: props.values.outcomes.length, name: "", polarity: "buff", description: "", effectTags: [] }]);
const removeOutcome = (index: number) => emitOutcomes(props.values.outcomes.filter((_, item) => item !== index));
const moveOutcome = (index: number, delta: -1 | 1) => {
  const target = index + delta;
  if (target < 0 || target >= props.values.outcomes.length) return;
  const rows = [...props.values.outcomes];
  [rows[index], rows[target]] = [rows[target]!, rows[index]!];
  emitOutcomes(rows);
};
const outcomesInvalid = computed(() => props.values.category === randomEventCompositeCategory && !randomEventOutcomesValid(props.values.category, props.values.outcomes));
</script>

<template>
  <div class="event-fields">
    <UFormField label="名称"><UInput :model-value="values.name" required class="w-full" :disabled="disabled" @change="emit('patch', { name: ($event.target as HTMLInputElement).value })" /></UFormField>
    <div class="event-fields__pair">
      <UFormField label="事件组"><UInputMenu :model-value="values.eventGroup ?? ''" :items="groups" create-item clear placeholder="选择或输入" class="w-full" :disabled="disabled" @update:model-value="emit('patch', { eventGroup: $event || null })" @create="emit('patch', { eventGroup: $event.trim() || null })" @clear="emit('patch', { eventGroup: null })" /></UFormField>
      <UFormField label="类别"><UInputMenu :model-value="values.category" :items="categories" create-item placeholder="选择或输入" class="w-full" :disabled="disabled" required @update:model-value="patchCategory($event)" @create="patchCategory($event.trim())" /></UFormField>
    </div>
    <div class="event-fields__pair">
      <UFormField label="版本"><UInputMenu :model-value="values.gameVersion" :items="versions" create-item placeholder="选择或输入" class="w-full" :disabled="disabled" required @update:model-value="emit('patch', { gameVersion: $event })" @create="emit('patch', { gameVersion: $event.trim() })" /></UFormField>
      <UFormField label="状态"><USelect :model-value="values.releaseStatus" :items="statusItems" class="w-full" :disabled="disabled" @update:model-value="emit('patch', { releaseStatus: $event as EventFieldValues['releaseStatus'] })" /></UFormField>
    </div>
    <div class="event-fields__pair">
      <UFormField label="权重" :hint="`稀有度：${rarity}`"><UInput :model-value="values.weight ?? undefined" type="number" step="0.05" min="0" class="w-full" :disabled="disabled" @input="emit('patch', { weight: numberOrNull(($event.target as HTMLInputElement).value) })" /></UFormField>
      <UFormField label="持续时间（秒）"><UInput :model-value="values.durationSeconds ?? undefined" type="number" min="0" class="w-full" :disabled="disabled" @change="emit('patch', { durationSeconds: numberOrNull(($event.target as HTMLInputElement).value) })" /></UFormField>
    </div>
    <UFormField label="内置冷却（秒）"><UInput :model-value="values.cooldownSeconds ?? undefined" type="number" min="0" class="w-full" :disabled="disabled" @change="emit('patch', { cooldownSeconds: numberOrNull(($event.target as HTMLInputElement).value) })" /></UFormField>
    <UFormField label="内容说明"><UTextarea :model-value="values.description" :rows="4" class="w-full" :disabled="disabled" @change="emit('patch', { description: ($event.target as HTMLTextAreaElement).value })" /></UFormField>
    <UFormField label="效果标签"><UInputMenu v-model="tagsModel" :items="tags" multiple create-item placeholder="输入或选择效果标签" aria-label="效果标签" class="w-full" :disabled="disabled" /></UFormField>

    <section v-if="values.category === '复合'" class="event-fields__outcomes" aria-label="结果项">
      <div class="event-fields__outcomes-head">
        <span class="type-label-sm">结果项</span>
        <UButton label="添加结果项" icon="i-lucide-plus" color="neutral" variant="outline" size="xs" :disabled="disabled" @click="addOutcome" />
      </div>
      <UAlert v-if="outcomesInvalid" color="warning" variant="subtle" description="复合事件需要至少两个结果项，并同时包含增益和减益。" />
      <article v-for="(outcome, index) in values.outcomes" :key="index" class="event-fields__outcome">
        <div class="event-fields__outcome-bar">
          <USelect :model-value="outcome.polarity" :items="polarityItems" size="sm" class="event-fields__polarity" aria-label="极性" :disabled="disabled" @update:model-value="setOutcome(index, { polarity: $event as EventOutcome['polarity'] })" />
          <span class="event-fields__spacer" />
          <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="xs" square aria-label="上移结果项" :disabled="disabled || index === 0" @click="moveOutcome(index, -1)" />
          <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="xs" square aria-label="下移结果项" :disabled="disabled || index === values.outcomes.length - 1" @click="moveOutcome(index, 1)" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" square aria-label="删除结果项" :disabled="disabled" @click="removeOutcome(index)" />
        </div>
        <UInput :model-value="outcome.name" placeholder="结果项名称" aria-label="结果项名称" class="w-full" :disabled="disabled" @change="setOutcome(index, { name: ($event.target as HTMLInputElement).value })" />
        <UTextarea :model-value="outcome.description" :rows="2" placeholder="结果说明" aria-label="结果说明" class="w-full" :disabled="disabled" @change="setOutcome(index, { description: ($event.target as HTMLTextAreaElement).value })" />
        <UInputMenu :model-value="outcome.effectTags" :items="tags" multiple create-item placeholder="效果标签" aria-label="结果项效果标签" class="w-full" :disabled="disabled" @update:model-value="setOutcome(index, { effectTags: ($event as string[]).map((tag) => tag.trim()).filter(Boolean) })" />
      </article>
    </section>
  </div>
</template>

<style scoped>
.event-fields { container-type: inline-size; display: grid; gap: var(--space-3); min-width: 0; }
.event-fields__pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.event-fields__outcomes { display: grid; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface-raised); }
.event-fields__outcomes-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.event-fields__outcome { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); }
.event-fields__outcome-bar { display: flex; align-items: center; gap: var(--space-1); }
.event-fields__polarity { width: 6rem; }
.event-fields__spacer { flex: 1; }
@container (max-width: 23.99rem) { .event-fields__pair { grid-template-columns: minmax(0, 1fr); } }
</style>
