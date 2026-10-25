<script setup lang="ts">
import type { AdminVerifiedRun, AdminVerifiedRunCorrectionChanges } from "~/composables/useAdminApi";
import type { AdminMapEditor } from "~/composables/useAdminMapEditor";
import { lifecycleLabels } from "~/utils/map-lifecycle";
import { formatDuration, parseDurationSeconds } from "~/utils/duration";

const props = defineProps<{
  run: AdminVerifiedRun;
  maps: { mapId: string; mapName: string }[];
  events: { eventId: string; name: string }[];
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
  completionDuration: formatDuration(props.run.completionDurationSeconds),
  deaths: props.run.deaths == null ? "" : String(props.run.deaths),
  skips: props.run.skips == null ? "" : String(props.run.skips),
  eventCounters: Object.entries(props.run.eventCounters).map(([eventId, count]) => ({ eventId, count: String(count) })),
  reason: "",
});
const validationError = ref("");
const api = useAdminApi();
const revisions = shallowRef<AdminMapEditor["revisions"]>([]);
const eventName = (eventId: string) => props.events.find((event) => event.eventId === eventId)?.name ?? "未知事件";
const mapItems = computed(() => props.maps.some((map) => map.mapId === props.run.mapId) ? props.maps : [{ mapId: props.run.mapId, mapName: props.run.mapName }, ...props.maps]);
const revisionLabel = (revision: { lifecycle: keyof typeof lifecycleLabels; gameVersion: string; mapVariant: "classic" | null }) => `${lifecycleLabels[revision.lifecycle]} · ${revision.gameVersion}${revision.mapVariant === "classic" ? " · 经典版" : ""}`;
const revisionItems = computed(() => {
  const items = revisions.value.map((revision) => ({ label: revisionLabel(revision), value: revision.revisionId }));
  return items.some((item) => item.value === draft.gameplayRevisionId) ? items : [{ label: draft.mapId === props.run.mapId ? revisionLabel({ lifecycle: props.run.gameplayRevisionLifecycle, gameVersion: props.run.gameVersion, mapVariant: props.run.mapVariant }) : "请选择版本修订", value: draft.gameplayRevisionId }, ...items];
});
const addableEvents = computed(() => props.events.filter((event) => !draft.eventCounters.some((row) => row.eventId === event.eventId)).map((event) => ({ label: event.name, value: event.eventId })));
const removeEvent = (eventId: string) => { draft.eventCounters = draft.eventCounters.filter((row) => row.eventId !== eventId); };
const addEvent = (eventId: string) => { if (eventId) draft.eventCounters.push({ eventId, count: "1" }); };
watch(() => draft.mapId, async (mapId, previous) => {
  if (previous !== undefined && previous !== mapId) draft.gameplayRevisionId = "";
  const loaded = await api<AdminMapEditor>(`/v1/maps/${encodeURIComponent(mapId)}/editor`).then((response) => response.revisions).catch(() => []);
  if (draft.mapId !== mapId) return;
  revisions.value = loaded;
  if (!draft.gameplayRevisionId) draft.gameplayRevisionId = revisions.value.find((revision) => revision.lifecycle === "default")?.revisionId ?? revisions.value[0]?.revisionId ?? "";
}, { immediate: true });
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
    if (!draft.mapId || !draft.gameplayRevisionId) throw new Error("请选择地图和版本修订");
    if (!draft.gameVersion.trim()) throw new Error("游戏版本不能为空");
    const completionDurationSeconds = parseDurationSeconds(draft.completionDuration);
    if (!completionDurationSeconds) throw new Error("通关用时格式应为 1小时2分3秒，且大于零");
    const eventCounters = Object.fromEntries(draft.eventCounters.map((row) => {
      const count = Number(row.count);
      if (!row.count.trim() || !Number.isInteger(count) || count < 0) throw new Error("事件次数必须是非负整数");
      return [row.eventId, count];
    }));
    emit("submit", {
      changes: {
        mapId: draft.mapId,
        gameplayRevisionId: draft.gameplayRevisionId,
        difficulty: draft.difficulty,
        gameVersion: draft.gameVersion.trim(),
        matchCode: draft.matchCode.trim(),
        completionDurationSeconds,
        deaths: parseCount(draft.deaths, "死亡次数"),
        skips: parseCount(draft.skips, "跳过次数"),
        eventCounters,
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
      <UFormField label="地图" required><USelect v-model="draft.mapId" :items="mapItems.map((map) => ({ label: map.mapName, value: map.mapId }))" :disabled="saving" class="w-full" /></UFormField>
      <UFormField label="版本修订" required><USelect v-model="draft.gameplayRevisionId" :items="revisionItems" :disabled="saving" class="w-full" /></UFormField>
      <UFormField label="难度" required><USelect v-model="draft.difficulty" :items="difficulties.map((value) => ({ label: value, value }))" :disabled="saving" class="w-full" /></UFormField>
      <UFormField label="游戏版本" required><UInput v-model="draft.gameVersion" required :disabled="saving" /></UFormField>
      <UFormField label="对局码" required><UInput v-model="draft.matchCode" required :disabled="saving" /></UFormField>
      <UFormField label="通关用时" required><UInput v-model="draft.completionDuration" placeholder="例如 1小时2分3秒" required :disabled="saving" /></UFormField>
      <UFormField label="死亡次数" hint="留空表示未知"><UInput v-model="draft.deaths" type="number" min="0" step="1" :disabled="saving" /></UFormField>
      <UFormField label="跳过次数" hint="留空表示未知"><UInput v-model="draft.skips" type="number" min="0" step="1" :disabled="saving" /></UFormField>
    </div>
    <fieldset class="verified-run-correction__events">
      <legend>事件次数</legend>
      <UFormField v-for="row in draft.eventCounters" :key="row.eventId" :label="eventName(row.eventId)"><div class="verified-run-correction__event-row"><UInput v-model="row.count" type="number" min="0" step="1" :disabled="saving" /><UButton label="移除" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="removeEvent(row.eventId)" /></div></UFormField>
      <USelect v-if="addableEvents.length" model-value="" :items="addableEvents" placeholder="添加事件" :disabled="saving" aria-label="添加事件" @update:model-value="addEvent($event as string)" />
    </fieldset>
    <UFormField label="更正理由和依据"><UTextarea v-model="draft.reason" :rows="3" :disabled="saving" placeholder="核对依据和本次修正内容" /></UFormField>
    <div class="verified-run-correction__actions">
      <UButton type="submit" label="保存更正" :loading="saving" />
      <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="emit('cancel')" />
    </div>
  </form>
</template>

<style scoped>
.verified-run-correction { display: grid; gap: 1rem; min-width: 0; }
.verified-run-correction__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: .75rem; }
.verified-run-correction__events { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: .75rem; min-width: 0; padding: 0; border: 0; }
.verified-run-correction__event-row { display: flex; align-items: center; gap: .5rem; }
.verified-run-correction__events legend { margin-bottom: .5rem; font-size: var(--type-label-sm-size); font-weight: 500; }
.verified-run-correction__actions { display: flex; flex-wrap: wrap; justify-content: end; gap: .5rem; }
</style>
