<script setup lang="ts">
import { randomEventRarityForWeight } from "@owbastion/domain";
import type { RandomEvent } from "~/types/random-event";
import { calculateEventProbabilities, formatProbability } from "~/utils/event-probabilities";
import { bodyFromEvent, bodyFromForm, emptyEventForm, formFromEvent, isFormDirty, type EventForm } from "~/utils/event-editor";

const props = defineProps<{ event: RandomEvent | null; events: RandomEvent[]; saving: boolean }>();
const emit = defineEmits<{ save: [body: ReturnType<typeof bodyFromForm>]; archive: [] }>();
const dirty = defineModel<boolean>("dirty", { default: false });

const form = reactive<EventForm>(emptyEventForm());
const baseline = shallowRef<EventForm>(emptyEventForm());
const isNew = computed(() => props.event === null);

// Selecting another event replaces the form. A refresh of the same event never discards typing: it only moves the baseline.
watch(() => [props.event?.eventId ?? "new", props.event ? JSON.stringify(bodyFromEvent(props.event)) : ""] as const, ([id], previous) => {
  const next = props.event ? formFromEvent(props.event) : emptyEventForm();
  if (!previous || id !== previous[0] || !dirty.value) Object.assign(form, structuredClone(toRaw(next)));
  baseline.value = next;
}, { immediate: true });
watchEffect(() => { dirty.value = isFormDirty(form, baseline.value); });

const groupItems = computed(() => [...new Set(props.events.map((item) => item.eventGroup).filter((group): group is string => Boolean(group)))].sort((left, right) => left.localeCompare(right, "zh-CN")));
const categoryItems = computed(() => [...new Set(props.events.map((item) => item.category))].sort());
const tagItems = computed(() => [...new Set(props.events.flatMap((item) => item.effectTags))].sort());
const derivedRarity = computed(() => randomEventRarityForWeight(form.weight ?? null) || "—");
const createTag = (value: string) => { const tag = value.trim(); if (tag && !form.effectTags.includes(tag)) form.effectTags.push(tag); };
const challengeLabel = (challenge: RandomEvent["challenges"][number]) => challenge.family === "map" ? challenge.name : challenge.titleName;

// Probability now versus with the weight and status being typed, so a balance change shows its effect before saving.
const current = computed(() => props.event ? calculateEventProbabilities(props.event, props.events) : null);
const draft = computed(() => {
  const base = props.event;
  const draftEvent = { ...(base ?? { eventId: "__new__", name: form.name, category: form.category, rarity: "", description: form.description, durationSeconds: null, cooldownSeconds: null, gameVersion: form.gameVersion, eventGroup: null, effectTags: [], effectAnnotations: [], archived: false, challenges: [] }), weight: form.weight, releaseStatus: form.releaseStatus } as RandomEvent;
  const others = props.events.filter((item) => item.eventId !== draftEvent.eventId);
  return calculateEventProbabilities(draftEvent, [...others, draftEvent]);
});
const changed = computed(() => dirty.value && draft.value.appearanceProbability !== current.value?.appearanceProbability);
</script>

<template>
  <form class="event-editor" aria-label="事件编辑" @submit.prevent="emit('save', bodyFromForm(form))">
    <section class="event-editor__section">
      <h3 class="text-base font-semibold">基本信息</h3>
      <div class="event-editor__grid">
        <UFormField label="名称"><UInput v-model="form.name" required class="w-full" /></UFormField>
        <UFormField label="类别"><UInputMenu v-model="form.category" :items="categoryItems" create-item placeholder="选择或输入类别" :disabled="saving" required class="w-full" @create="form.category = $event.trim()" /></UFormField>
        <UFormField label="事件组"><UInputMenu v-model="form.eventGroup" :items="groupItems" create-item clear placeholder="选择或输入事件组" :disabled="saving" class="w-full" @create="form.eventGroup = $event.trim()" @clear="form.eventGroup = ''" /></UFormField>
        <UFormField label="版本"><UInput v-model="form.gameVersion" required class="w-full" /></UFormField>
        <UFormField label="事件状态"><USelect v-model="form.releaseStatus" :items="[{ label: '开发中', value: 'development' }, { label: '已实装', value: 'implemented' }, { label: '已移除', value: 'removed' }]" class="w-full" /></UFormField>
        <UFormField label="权重" :hint="`稀有度：${derivedRarity}`"><UInputNumber v-model="form.weight" :min="0" :step="0.01" class="w-full" /></UFormField>
        <UFormField label="内置冷却（秒）"><UInputNumber v-model="form.cooldownSeconds" :min="0" class="w-full" /></UFormField>
        <UFormField label="持续时间（秒）"><UInputNumber v-model="form.durationSeconds" :min="0" class="w-full" /></UFormField>
      </div>
      <UFormField class="w-full" label="内容说明"><UTextarea v-model="form.description" required :rows="4" class="w-full" /></UFormField>
      <UFormField label="效果标签"><UInputMenu v-model="form.effectTags" :items="tagItems" multiple create-item placeholder="输入或选择效果标签" :disabled="saving" aria-label="效果标签" class="w-full" @create="createTag" /></UFormField>
    </section>

    <section class="event-editor__section" aria-label="概率信息">
      <h3 class="text-base font-semibold">概率信息</h3>
      <template v-if="!isNew">
        <div class="event-editor__probability" aria-live="polite">
          <span class="event-editor__probability-value num">{{ formatProbability(current?.appearanceProbability ?? null) }}</span>
          <span v-if="changed" class="event-editor__probability-next num">保存后 {{ formatProbability(draft.appearanceProbability) }}</span>
        </div>
        <dl class="detail-grid">
          <div class="detail-grid__row"><dt>候选池事件数</dt><dd class="num">{{ current?.poolSize }}</dd></div>
          <div class="detail-grid__row"><dt>池内总权重</dt><dd class="num">{{ current?.poolTotalWeight == null ? "暂无记录" : Number(current.poolTotalWeight.toFixed(4)) }}</dd></div>
          <div class="detail-grid__row"><dt>单次失败率</dt><dd class="num">{{ formatProbability(current?.failureProbability ?? null) }}</dd></div>
          <div class="detail-grid__row"><dt>保底触发率</dt><dd class="num">{{ formatProbability(current?.guaranteeProbability ?? null) }}</dd></div>
        </dl>
        <p class="text-sm text-muted">基础概率：按全部已实装事件计算，未计入最近事件去重和特殊资格限制。</p>
      </template>
      <p v-else class="text-sm text-muted">保存事件后，根据全部已实装事件计算概率。</p>
    </section>

    <section class="event-editor__section">
      <UFormField label="关联挑战">
        <ul v-if="event?.challenges.length" class="event-editor__links">
          <li v-for="challenge in event.challenges" :key="`${challenge.family}-${challenge.challengeId}-${challenge.family === 'map' ? challenge.gameplayRevisionId : ''}`">{{ challengeLabel(challenge) }}</li>
        </ul>
        <p v-else class="text-sm text-muted">暂无关联挑战</p>
      </UFormField>
    </section>

    <div class="event-editor__actions action-row">
      <UButton type="submit" :label="isNew ? '创建事件' : '保存事件'" :loading="saving" :disabled="!isNew && !dirty" />
      <UButton v-if="!isNew" label="归档" color="error" variant="soft" type="button" :disabled="saving" @click="emit('archive')" />
    </div>
  </form>
</template>

<style scoped>
.event-editor { container-type: inline-size; display: grid; gap: var(--space-6); min-width: 0; }
.event-editor__section { display: grid; gap: var(--space-3); min-width: 0; }
.event-editor__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.event-editor__grid > * { min-width: 0; }
.event-editor__probability { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--space-3); }
.event-editor__probability-value { color: var(--accent); font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.event-editor__probability-next { color: var(--muted); font-size: var(--type-label-size); font-weight: 600; }
.event-editor__links { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.event-editor__links li { padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); font-size: var(--type-body-sm-size); }
.event-editor__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
@container (max-width: 29.99rem) { .event-editor__grid { grid-template-columns: minmax(0, 1fr); } }
</style>
