<script setup lang="ts">
import type { AdminSubmission, AdminSubmissionReviewPreview } from "~/composables/useAdminApi";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";
import { mapVariantLabel } from "~/utils/map-variant";

type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };

const props = defineProps<{ submission: AdminSubmission; preview?: AdminSubmissionReviewPreview | null; disabled?: boolean }>();
const emit = defineEmits<{ "field-corrections": [value: Array<{ fieldKey: string; reviewedValue: string }>] }>();

const annotatableFields = [
  { key: "map_name", label: "地图" },
  { key: "difficulty", label: "难度" },
  { key: "viewer_player", label: "玩家名称" },
  { key: "challenge_completed", label: "通关标记" },
  { key: "map_variant", label: "地图版本" },
  { key: "achievement_titles", label: "左侧成就面板" },
  { key: "version", label: "游戏版本" },
  { key: "run_code", label: "对局码" },
  { key: "duration_seconds", label: "通关用时（秒）" },
  { key: "deaths", label: "死亡次数" },
  { key: "skips", label: "跳过次数" },
] as const;
const typedFieldPlaceholder: Record<string, string> = { version: "例如 2026.0928.1", run_code: "输入截图中的对局码", duration_seconds: "整数秒", deaths: "整数", skips: "整数" };
const ocrPayload = computed(() => props.submission.ocr as OcrPayload | null);
const modelVersion = computed(() => typeof ocrPayload.value?.model_version === "string" && ocrPayload.value.model_version ? ocrPayload.value.model_version : null);
const checkedTitles = computed(() => Array.isArray(ocrPayload.value?.data?.achievement_titles) ? ocrPayload.value?.data?.achievement_titles.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []);
const achievementPanelLabel = computed(() => checkedTitles.value.length ? checkedTitles.value.join("、") : "无");
const runtimeEvidence = computed(() => {
  const data = ocrPayload.value?.data;
  if (!data) return [];
  const labels: Record<string, string> = {
    ai_mark_detected: "AI 标记", mode: "模式", restart_in_seconds: "重启倒计时（秒）",
    uptime_seconds: "运行时间（秒）", server_load: "服务器负载",
  };
  return Object.entries(labels).filter(([key]) => key in data).map(([key, label]) => ({
    key, label,
    value: data[key] === null || data[key] === undefined ? "未识别"
      : key === "ai_mark_detected" ? data[key] === true ? "已检测到" : "未检测到" : String(data[key]),
  }));
});
const eventEvidence = computed(() => {
  const event = ocrPayload.value?.data?.event;
  if (!event || typeof event !== "object" || Array.isArray(event)) return [];
  const data = event as Record<string, unknown>;
  const descriptions = Array.isArray(data.description) ? data.description.filter((value): value is string => typeof value === "string") : [];
  const numbers = Array.isArray(data.numbers) ? data.numbers.flatMap((number) => {
    if (!number || typeof number !== "object") return [];
    const item = number as Record<string, unknown>;
    return typeof item.text === "string" && typeof item.value === "number"
      ? [`${item.text}：${item.value}${typeof item.unit === "string" ? item.unit : ""}`] : [];
  }) : [];
  return [
    { key: "event.name", label: "事件", value: typeof data.name === "string" ? data.name : "未识别" },
    { key: "event.duration_seconds", label: "持续时间（秒）", value: typeof data.duration_seconds === "number" ? String(data.duration_seconds) : "未识别" },
    { key: "event.description", label: "事件说明", value: descriptions.join("；") || "未识别" },
    { key: "event.numbers", label: "事件数值", value: numbers.join("；") || "未识别" },
    { key: "event.text", label: "事件原文", value: typeof data.text === "string" ? data.text : "未识别" },
  ];
});
const correctionInputs = reactive<Record<string, string>>({});
// What the recognition produced, to tell a confirmed value from a corrected one.
const initialInputs: Record<string, string> = {};
const confirmedFields = ref<string[]>([]);
watch(() => ocrPayload.value?.data, (data) => {
  if (!data) return;
  for (const field of annotatableFields) {
    const value = data[field.key];
    correctionInputs[field.key] = Array.isArray(value) ? value.join("、") : value === null || value === undefined ? "" : String(value);
    initialInputs[field.key] = correctionInputs[field.key]!;
  }
}, { immediate: true });
const api = useAdminApi();
const mapNames = ref<string[]>([]);
const titleNames = ref<string[]>([]);
onMounted(async () => {
  try {
    const [maps, titles] = await Promise.all([api<{ items: Array<{ mapName: string }> }>("/v1/maps"), api<{ items: Array<{ label: string }> }>("/v1/titles")]);
    mapNames.value = maps.items.map((map) => map.mapName);
    titleNames.value = titles.items.map((title) => title.label);
  } catch {
    // Choices stay limited to the values already on the Submission.
  }
});
const difficultyNames = ["简单", "一般", "困难", "专家", "传奇", "地狱"];
const withCurrent = (values: readonly string[], current: readonly string[]) => [...new Set([...values, ...current.filter(Boolean)])];
const fieldChoices = (key: string): Array<string | { label: string; value: string }> => {
  const current = correctionInputs[key] ?? "";
  switch (key) {
    case "map_name": return withCurrent(mapNames.value, [current]);
    case "difficulty": return withCurrent(difficultyNames, [current]);
    case "viewer_player": return withCurrent([props.submission.playerName], [current]);
    case "challenge_completed": return [{ label: "已完成", value: "true" }, { label: "未完成", value: "false" }];
    case "map_variant": return [{ label: "标准", value: "standard" }, { label: "经典", value: "classic" }];
    default: return [];
  }
};
const selectedTitles = computed({
  get: () => correctionInputs.achievement_titles?.split("、").filter(Boolean) ?? [],
  set: (value: string[]) => { correctionInputs.achievement_titles = value.join("、"); },
});
const fieldCorrections = computed(() => annotatableFields.filter((field) => confirmedFields.value.includes(field.key) && correctionInputs[field.key]?.trim()).map((field) => ({ fieldKey: field.key, reviewedValue: field.key === "achievement_titles" ? correctionInputs[field.key]!.split(/[、,，\n]/).map((value) => value.trim()).filter(Boolean).join("、") : correctionInputs[field.key]!.trim() })));
watch(fieldCorrections, (value) => emit("field-corrections", value), { immediate: true });
const toggleFieldConfirmation = (fieldKey: string, checked: boolean) => {
  confirmedFields.value = checked ? [...new Set([...confirmedFields.value, fieldKey])] : confirmedFields.value.filter((key) => key !== fieldKey);
};


const ocrValue = (value: unknown) => value === null || value === undefined ? "未识别" : value === true ? "已识别完成" : value === false ? "未识别完成" : String(value);
const ocrDisplayValue = (name: string, value: unknown) => name === "map_variant" ? mapVariantLabel(value) : ocrValue(value);
const ocrConfidence = (value: unknown) => typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
const hasOcrConfidence = (value: unknown) => typeof value === "number";
const ocrFieldStatusLabel = (status: unknown) => {
  if (status === "ok") return "已识别";
  if (status === "missing") return "未识别";
  if (status === "low_confidence") return "置信度低";
  if (status === "unreadable") return "无法识别";
  if (status === "error") return "识别失败";
  return "需核对";
};
const ocrFieldStatusTone = (status: unknown): "default" | "success" | "warning" => status === "ok" ? "success" : status === "missing" || status === "low_confidence" || status === "unreadable" || status === "error" ? "warning" : "default";
const candidates = computed(() => props.preview?.candidates ?? []);
const primaryFieldKeys: readonly string[] = ["map_name", "difficulty", "viewer_player", "challenge_completed", "map_variant", "achievement_titles"];
// Fields a still-unconfirmed Challenge is waiting for, so the chips can point at what needs checking.
const neededFields = computed(() => new Set<string>(candidates.value.filter((candidate) => candidate.evidence === "needs_confirmation" && candidate.selectedBy === null).flatMap((candidate) => candidate.missingFields)));
const showExtraFields = ref(false);
const openKey = ref<string | null>(null);
// What the maintainer entered for a field, in words (a select stores values like "true" or "standard").
const reviewedLabel = (key: string) => {
  const value = correctionInputs[key] ?? "";
  const choice = fieldChoices(key).find((item) => typeof item === "object" && item.value === value);
  return typeof choice === "object" ? choice.label : value;
};
const fieldRows = computed(() => annotatableFields.map((field) => {
  const ocr = ocrPayload.value?.fields?.[field.key];
  const raw = ocr?.value ?? ocrPayload.value?.data?.[field.key];
  const attested = confirmedFields.value.includes(field.key);
  const isPanel = field.key === "achievement_titles";
  const primary = primaryFieldKeys.includes(field.key);
  // The panel and the map version always read as something ("无", the standard version); only truly absent values invite typing one in.
  const recognized = isPanel || field.key === "map_variant" || (raw !== null && raw !== undefined);
  const needed = neededFields.value.has(field.key) && !attested;
  const attention = !attested && (needed || (primary && (!recognized || (ocr?.status !== undefined && ocr.status !== "ok"))));
  const changed = attested && (correctionInputs[field.key] ?? "") !== (initialInputs[field.key] ?? "");
  const text = isPanel ? achievementPanelLabel.value : ocrDisplayValue(field.key, raw);
  const state = changed ? "corrected" : attested ? "reviewed" : attention ? "attention" : "ok";
  return {
    ...field,
    primary, text, recognized, needed, attested, changed, state,
    confidence: ocr?.confidence,
    status: ocr?.status,
    shown: attested ? reviewedLabel(field.key) || text : text,
    stateLabel: { corrected: "已校正", reviewed: "已核对", attention: "待确认", ok: "一致" }[state],
    icon: { corrected: "i-lucide-pencil", reviewed: "i-lucide-check-check", attention: "i-lucide-circle-help", ok: "i-lucide-check" }[state],
  };
}));
const visibleFieldRows = computed(() => fieldRows.value.filter((row) => row.primary || showExtraFields.value || row.attested || row.needed));
const extraFieldCount = computed(() => fieldRows.value.filter((row) => !row.primary).length);
const attentionCount = computed(() => visibleFieldRows.value.filter((row) => row.state === "attention").length);
const summaryText = computed(() => {
  const settled = visibleFieldRows.value.length - attentionCount.value;
  return attentionCount.value ? `${settled} 项一致，${attentionCount.value} 项待你确认` : `${settled} 项全部一致`;
});
const openRow = computed(() => visibleFieldRows.value.find((row) => row.key === openKey.value) ?? null);
const toggleOpen = (key: string) => { openKey.value = openKey.value === key ? null : key; };
// Open the first field a Challenge is waiting for, so the common case needs no hunting.
watch(() => fieldRows.value.find((row) => row.needed)?.key, (key) => { if (key && openKey.value === null) openKey.value = key; }, { immediate: true });
const confirmField = (key: string) => toggleFieldConfirmation(key, true);
</script>

<template>
  <div class="fields">
    <AdminSignalPanel :kicker="modelVersion ? `OCRKit · ${modelVersion}` : 'OCRKit'" title="识别核对" title-id="check-title">
      <template #aside>
        <StatusBadge :label="ocrStatusLabel(submission.ocrStatus)" :tone="ocrStatusTone(submission.ocrStatus)" />
      </template>
      <p v-if="submission.ocrErrorCode" class="signal-error" role="status">识别错误：{{ submission.ocrErrorCode }}</p>
      <p v-if="Array.isArray(ocrPayload?.warnings) && ocrPayload.warnings.length" class="signal-note">告警：{{ ocrPayload.warnings.join("、") }}</p>
      <p class="check-line" :class="{ 'check-line--attention': attentionCount }" role="status">{{ summaryText }}</p>
      <ul class="check-chips" aria-label="识别字段">
        <li v-for="row in visibleFieldRows" :key="row.key">
          <button
            type="button"
            class="check-chip pressable-soft"
            :class="`check-chip--${row.state}`"
            :aria-expanded="openKey === row.key"
            :aria-controls="`check-editor-${row.key}`"
            :aria-label="`${row.label}：${row.shown}，${row.stateLabel}`"
            @click="toggleOpen(row.key)"
          >
            <UIcon :name="row.icon" class="check-chip__icon" aria-hidden="true" />
            <span class="check-chip__label">{{ row.label }}</span>
            <span class="check-chip__value">{{ row.shown }}</span>
          </button>
        </li>
        <li v-if="extraFieldCount">
          <UButton type="button" size="sm" color="neutral" variant="ghost" :icon="showExtraFields ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" :label="showExtraFields ? '收起更多字段' : `更多字段（${extraFieldCount}）`" :aria-expanded="showExtraFields" @click="showExtraFields = !showExtraFields" />
        </li>
      </ul>
      <div v-if="openRow" :id="`check-editor-${openRow.key}`" class="check-editor" role="group" :aria-label="`${openRow.label}核对`">
        <div class="check-editor__head">
          <strong>{{ openRow.label }}</strong>
          <span class="ocr-field-meta">
            <span class="check-editor__ocr">识别：{{ openRow.text }}</span>
            <span v-if="hasOcrConfidence(openRow.confidence)" class="ocr-confidence">{{ ocrConfidence(openRow.confidence) }}</span>
            <StatusBadge v-if="openRow.status" :label="ocrFieldStatusLabel(openRow.status)" :tone="ocrFieldStatusTone(openRow.status)" />
          </span>
        </div>
        <div class="check-editor__control">
          <USelectMenu v-if="openRow.key === 'achievement_titles'" v-model="selectedTitles" multiple :items="withCurrent(titleNames, selectedTitles)" :aria-label="`截图中的${openRow.label}完整值`" placeholder="选择截图中的全部成就" :disabled="disabled" @update:model-value="confirmField(openRow.key)" />
          <UInput v-else-if="openRow.key in typedFieldPlaceholder" v-model="correctionInputs[openRow.key]" :inputmode="['duration_seconds', 'deaths', 'skips'].includes(openRow.key) ? 'numeric' : 'text'" :aria-label="`截图中的${openRow.label}`" :placeholder="typedFieldPlaceholder[openRow.key]" :disabled="disabled" @update:model-value="confirmField(openRow.key)" />
          <USelect v-else v-model="correctionInputs[openRow.key]" :items="fieldChoices(openRow.key)" :aria-label="`截图中的${openRow.label}完整值`" :placeholder="`选择截图中的${openRow.label}`" :disabled="disabled" @update:model-value="confirmField(openRow.key)" />
          <UButton v-if="!openRow.attested" type="button" icon="i-lucide-check" label="确认无误" size="sm" color="neutral" variant="outline" :aria-label="`核对${openRow.label}`" :disabled="disabled || !(correctionInputs[openRow.key] ?? '').trim()" @click="confirmField(openRow.key)" />
          <UButton v-else type="button" icon="i-lucide-undo-2" label="撤销核对" size="sm" color="neutral" variant="ghost" :aria-label="`撤销核对${openRow.label}`" :disabled="disabled" @click="toggleFieldConfirmation(openRow.key, false)" />
        </div>
        <p class="check-editor__hint">核对后的值会随审核决定保存。</p>
      </div>
      <details v-if="ocrPayload" class="ocr-detail">
        <summary>识别详情</summary>
        <dl class="signal-meta">
          <div><dt>处理尝试</dt><dd>{{ submission.ocrAttempt ?? "暂无记录" }}</dd></div>
        </dl>
        <dl v-if="runtimeEvidence.length || eventEvidence.length" class="detail-grid" aria-label="对局环境识别证据">
          <div v-for="field in [...runtimeEvidence, ...eventEvidence]" :key="field.key" class="detail-grid__row"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div>
        </dl>
        <details><summary>查看原始识别数据</summary><pre>{{ JSON.stringify(ocrPayload, null, 2) }}</pre></details>
      </details>
      <p v-else class="signal-empty">暂无 OCR 结果，可逐项填写截图中的实际值。</p>
    </AdminSignalPanel>
  </div>
</template>

<style scoped>
.fields {
  container-type: inline-size;
  min-width: 0;
}
.check-line {
  margin: 0 0 var(--space-3);
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  font-weight: 600;
}
.check-line--attention {
  color: var(--warning);
}
.check-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.check-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  min-height: var(--control-sm);
  padding: 0 var(--space-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
  font-size: var(--type-label-sm-size);
  cursor: pointer;
}
.check-chip__icon {
  flex: none;
  color: var(--success);
}
.check-chip__label {
  color: var(--muted);
  font-weight: 500;
  white-space: nowrap;
}
.check-chip__value {
  min-width: 0;
  max-width: 12rem;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.check-chip--attention {
  border-color: color-mix(in oklch, var(--warning) 45%, transparent);
  background: color-mix(in oklch, var(--warning) 14%, var(--surface));
}
.check-chip--attention .check-chip__icon {
  color: var(--warning);
}
.check-chip--reviewed,
.check-chip--corrected {
  border-color: transparent;
  background: var(--success-surface);
}
.check-chip[aria-expanded="true"] {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
@media (pointer: coarse) {
  .check-chip {
    min-height: var(--control-lg);
  }
}
.check-editor {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface);
}
.check-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.check-editor__ocr {
  color: var(--muted);
  font-size: var(--type-caption-size);
  overflow-wrap: anywhere;
}
.check-editor__control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.check-editor__control > :is(input, select, [role="combobox"]) {
  flex: 1 1 10rem;
  min-width: 0;
}
.check-editor__hint {
  margin: 0;
  color: var(--quiet);
  font-size: var(--type-caption-size);
}
.signal-meta {
  display: grid;
  gap: 0;
  margin: 0;
}
.signal-meta > div {
  display: grid;
  grid-template-columns: minmax(74px, .35fr) minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--line);
}
.signal-meta > div:last-child {
  border-bottom: 0;
}
.signal-meta dt {
  color: var(--muted);
  font-size: var(--type-caption-size);
}
.signal-meta dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--type-caption-size);
  text-align: right;
}
.ocr-field-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ocr-detail {
  margin-top: var(--space-3);
}
.ocr-detail pre {
  max-height: 220px;
  overflow: auto;
  margin: var(--space-2) 0 0;
  padding: var(--space-3);
  color: var(--muted);
  background: var(--surface);
  font-size: var(--type-caption-size);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ocr-confidence,
.ocr-source {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  color: var(--muted);
  background: var(--surface);
  font-size: var(--type-caption-size);
  font-weight: 600;
  white-space: nowrap;
}
.ocr-confidence {
  color: var(--text);
}
</style>
