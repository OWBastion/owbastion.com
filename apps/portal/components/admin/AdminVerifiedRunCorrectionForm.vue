<script setup lang="ts">
import type { AdminVerifiedRun, AdminVerifiedRunCorrectionChanges } from "~/composables/useAdminApi";

const props = defineProps<{
  run: AdminVerifiedRun;
  saving?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  submit: [payload: { changes: AdminVerifiedRunCorrectionChanges; reason?: string }];
  cancel: [];
}>();

const draft = reactive({
  mapId: props.run.mapId,
  gameplayRevisionId: props.run.gameplayRevisionId,
  difficulty: props.run.difficulty,
  gameVersion: props.run.gameVersion,
  matchCode: props.run.matchCode,
  completionDurationSeconds: String(props.run.completionDurationSeconds),
  deaths: props.run.deaths == null ? "" : String(props.run.deaths),
  skips: props.run.skips == null ? "" : String(props.run.skips),
  eventCounters: JSON.stringify(props.run.eventCounters, null, 2),
  reason: "",
});
const validationError = ref("");
const difficulties = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;

const parseCount = (value: string, label: string, positive = false): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (positive ? 1 : 0)) throw new Error(`${label}必须是${positive ? "大于零的" : "非负"}整数`);
  return parsed;
};

function submit() {
  validationError.value = "";
  try {
    if (!draft.mapId.trim() || !draft.gameplayRevisionId.trim()) throw new Error("地图 ID 和玩法修订 ID 不能为空");
    if (!draft.gameVersion.trim()) throw new Error("游戏版本不能为空");
    const eventCounters = JSON.parse(draft.eventCounters) as unknown;
    if (!eventCounters || Array.isArray(eventCounters) || typeof eventCounters !== "object" || Object.values(eventCounters).some((value) => !Number.isInteger(value) || Number(value) < 0)) {
      throw new Error("事件计数必须是键为事件 ID、值为非负整数的 JSON 对象");
    }
    emit("submit", {
      changes: {
        mapId: draft.mapId.trim(),
        gameplayRevisionId: draft.gameplayRevisionId.trim(),
        difficulty: draft.difficulty,
        gameVersion: draft.gameVersion.trim(),
        matchCode: draft.matchCode.trim(),
        completionDurationSeconds: parseCount(draft.completionDurationSeconds, "通关用时", true)!,
        deaths: parseCount(draft.deaths, "死亡次数"),
        skips: parseCount(draft.skips, "跳过次数"),
        eventCounters: eventCounters as Record<string, number>,
      },
      ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
    });
  } catch (error) {
    validationError.value = error instanceof Error ? error.message : "更正内容无效";
  }
}
</script>

<template>
  <form class="verified-run-correction" :aria-busy="saving || undefined" @submit.prevent="submit">
    <UAlert color="warning" variant="subtle" description="更正会保留来源提交和接受记录，重新计算当前经验与地图档案，并保存更正前后的事实快照。" />
    <UAlert v-if="error" color="error" variant="subtle" :description="error" />
    <UAlert v-if="validationError" color="error" variant="subtle" :description="validationError" />

    <div class="verified-run-correction__grid">
      <UFormField label="地图 ID"><UInput v-model="draft.mapId" required :disabled="saving" /></UFormField>
      <UFormField label="玩法修订 ID"><UInput v-model="draft.gameplayRevisionId" required :disabled="saving" /></UFormField>
      <UFormField label="难度"><USelect v-model="draft.difficulty" :items="difficulties.map((value) => ({ label: value, value }))" :disabled="saving" /></UFormField>
      <UFormField label="游戏版本"><UInput v-model="draft.gameVersion" required :disabled="saving" /></UFormField>
      <UFormField label="通关码"><UInput v-model="draft.matchCode" required :disabled="saving" /></UFormField>
      <UFormField label="通关用时（秒）"><UInput v-model="draft.completionDurationSeconds" type="number" min="1" step="1" required :disabled="saving" /></UFormField>
      <UFormField label="死亡次数" hint="留空表示未知"><UInput v-model="draft.deaths" type="number" min="0" step="1" :disabled="saving" /></UFormField>
      <UFormField label="跳过次数" hint="留空表示未知"><UInput v-model="draft.skips" type="number" min="0" step="1" :disabled="saving" /></UFormField>
    </div>
    <UFormField label="事件计数（JSON）"><UTextarea v-model="draft.eventCounters" :rows="5" :disabled="saving" /></UFormField>
    <UFormField label="更正理由和依据（可选）"><UTextarea v-model="draft.reason" :rows="3" :disabled="saving" placeholder="核对依据和本次修正内容" /></UFormField>
    <div class="verified-run-correction__actions">
      <UButton type="submit" label="保存更正" :loading="saving" />
      <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="emit('cancel')" />
    </div>
  </form>
</template>

<style scoped>
.verified-run-correction { display: grid; gap: 1rem; min-width: 0; }
.verified-run-correction__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: .75rem; }
.verified-run-correction__actions { display: flex; flex-wrap: wrap; justify-content: end; gap: .5rem; }
</style>
