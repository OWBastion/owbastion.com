<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";
import { mapVariantLabel } from "~/utils/map-variant";

type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };
type MatchCandidate = {
  challengeId?: string;
  challengeType?: string;
  targetMapName?: string;
  targetDifficulty?: string | null;
  titleName?: string | null;
  matched?: boolean;
  conditionsSupported?: boolean;
  requiredFields?: string[];
  quality?: { accepted?: boolean; reasons?: string[] };
};

const props = defineProps<{ submission: AdminSubmission; stacked?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ "field-corrections": [value: Array<{ fieldKey: string; reviewedValue: string }> ] }>();

const ocrLabels: Record<string, string> = { map_name: "地图", map_variant: "地图版本", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记" };
const annotatableFields = [
  { key: "map_name", label: "地图" },
  { key: "difficulty", label: "难度" },
  { key: "viewer_player", label: "玩家名称" },
  { key: "challenge_completed", label: "通关标记" },
  { key: "map_variant", label: "地图版本" },
  { key: "achievement_titles", label: "完整成就列表" },
] as const;
const ocrPayload = computed(() => props.submission.ocr as OcrPayload | null);
const ocrFields = computed(() => Object.entries(ocrPayload.value?.fields ?? {}).filter(([name]) => name in ocrLabels));
const matchPayload = computed(() => props.submission.match as { outcome?: string; candidates?: MatchCandidate[] } | undefined | null);
const candidates = computed(() => matchPayload.value?.candidates ?? []);
const checkedTitles = computed(() => Array.isArray(ocrPayload.value?.data?.achievement_titles) ? ocrPayload.value?.data?.achievement_titles.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []);
const achievementPanelLabel = computed(() => checkedTitles.value.length ? checkedTitles.value.join("、") : "无");
const correctionInputs = reactive<Record<string, string>>({});
const confirmedFields = ref<string[]>([]);
watch(() => ocrPayload.value?.data, (data) => {
  if (!data) return;
  for (const field of annotatableFields) {
    const value = data[field.key];
    correctionInputs[field.key] = Array.isArray(value) ? value.join("、") : value === null || value === undefined ? "" : String(value);
  }
}, { immediate: true });
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
const matchOutcomeLabel = (outcome?: string) => outcome === "automatic" ? "证据已自动判定" : outcome === "review" ? "证据需人工核对" : outcome === "resubmit" ? "未匹配挑战" : "等待证据判定";
const candidateResultLabel = (candidate: MatchCandidate) => candidate.titleName || candidate.targetDifficulty && `${candidate.targetMapName} · ${candidate.targetDifficulty}` || candidate.targetMapName || candidate.challengeId || "挑战条件";
const candidateScopeLabel = (candidate: MatchCandidate) => candidate.titleName ? candidate.challengeType === "map_title_achievement" ? "地图称号" : "成就挑战" : "地图挑战";
const candidateStatusLabel = (candidate: MatchCandidate) => !candidate.conditionsSupported ? "挑战条件暂不支持" : !candidate.quality?.accepted ? "证据需核对" : candidate.matched ? "满足条件" : "不满足条件";
const candidateStatusTone = (candidate: MatchCandidate): "success" | "warning" => candidate.conditionsSupported && candidate.quality?.accepted && candidate.matched ? "success" : "warning";
</script>

<template>
  <div class="signals-grid" :class="{ 'signals-grid--stacked': stacked }" aria-label="自动判定与 OCR 证据">
    <section v-if="matchPayload" class="signal-panel match-panel" aria-labelledby="auto-match-title">
      <header class="signal-panel__header">
        <div>
          <p class="signal-kicker">核对</p>
          <h3 id="auto-match-title">Challenge Conditions 匹配</h3>
        </div>
        <StatusBadge :label="matchOutcomeLabel(matchPayload.outcome)" :tone="matchPayload.outcome === 'automatic' ? 'success' : 'warning'" />
      </header>
      <p v-if="submission.reason" class="signal-reason">{{ submission.reason }}</p>
      <p class="signal-note">候选结果由平台按提交时有效、且玩家尚未拥有的 Challenge Conditions 计算。通过审核后，平台会用核对后的证据重新计算全部匹配。</p>
      <div v-if="candidates.length" class="match-candidates">
        <article v-for="(candidate, index) in candidates" :key="`${candidate.challengeId ?? 'condition'}:${index}`" class="match-candidate">
          <div class="match-candidate__title">
            <strong>{{ candidateResultLabel(candidate) }}</strong>
            <span class="candidate-scope">{{ candidateScopeLabel(candidate) }}</span>
          </div>
          <div class="match-candidate__meta"><StatusBadge :label="candidateStatusLabel(candidate)" :tone="candidateStatusTone(candidate)" /></div>
          <p v-if="candidate.quality?.reasons?.length" class="candidate-reasons">{{ candidate.quality.reasons.join("、") }}</p>
          <p v-else-if="candidate.requiredFields?.length" class="candidate-reasons">依据：{{ candidate.requiredFields.join("、") }}</p>
        </article>
      </div>
      <p v-else class="signal-empty">当前证据没有匹配到可授予称号的 Challenge。</p>
      <section class="field-review" aria-labelledby="field-review-title">
        <div>
          <h4 id="field-review-title">审核中确认识别字段</h4>
          <p>勾选并确认截图中的完整值后，会随本次审核保存为审定标注。批准时平台会用校正后的结构化证据重新判定 Verified Run 与全部 Challenge Conditions。</p>
        </div>
        <div v-for="field in annotatableFields" :key="field.key" class="field-review__row">
          <UCheckbox :model-value="confirmedFields.includes(field.key)" :label="`已核对${field.label}`" :disabled="disabled" @update:model-value="toggleFieldConfirmation(field.key, Boolean($event))" />
          <UInput v-if="confirmedFields.includes(field.key)" v-model="correctionInputs[field.key]" :aria-label="`截图中的${field.label}完整值`" :placeholder="field.key === 'achievement_titles' ? '多个成就以顿号分隔' : `输入截图中完整的${field.label}`" :disabled="disabled" />
        </div>
      </section>
    </section>

    <section class="signal-panel ocr-panel" aria-labelledby="ocr-title">
      <header class="signal-panel__header">
        <div>
          <p class="signal-kicker">识别</p>
          <h3 id="ocr-title">OCRKit</h3>
        </div>
        <StatusBadge :label="ocrStatusLabel(submission.ocrStatus)" :tone="ocrStatusTone(submission.ocrStatus)" />
      </header>
      <dl class="signal-meta">
        <div><dt>处理尝试</dt><dd>{{ submission.ocrAttempt ?? "暂无记录" }}</dd></div>
        <div v-if="submission.ocrErrorCode"><dt>错误代码</dt><dd>{{ submission.ocrErrorCode }}</dd></div>
      </dl>
      <template v-if="ocrPayload">
        <dl class="ocr-fields">
          <div v-for="[name, field] in ocrFields" :key="name"><dt>{{ ocrLabels[name] }}</dt><dd><strong class="ocr-field-value">{{ ocrDisplayValue(name, field.value ?? ocrPayload.data?.[name]) }}</strong><span class="ocr-field-meta"><span v-if="hasOcrConfidence(field.confidence)" class="ocr-confidence">{{ ocrConfidence(field.confidence) }}</span><StatusBadge :label="ocrFieldStatusLabel(field.status)" :tone="ocrFieldStatusTone(field.status)" /></span></dd></div>
          <div v-if="ocrPayload.data?.map_variant !== undefined && !ocrFields.some(([name]) => name === 'map_variant')"><dt>地图版本</dt><dd><strong class="ocr-field-value">{{ mapVariantLabel(ocrPayload.data.map_variant) }}</strong><span class="ocr-field-meta"><span class="ocr-source">OCR 数据</span></span></dd></div>
          <div class="ocr-achievement-evidence"><dt>左侧成就面板</dt><dd><strong class="ocr-field-value">{{ achievementPanelLabel }}</strong></dd></div>
        </dl>
        <p v-if="Array.isArray(ocrPayload.warnings) && ocrPayload.warnings.length" class="signal-note">告警：{{ ocrPayload.warnings.join("、") }}</p>
        <details><summary>查看原始识别数据</summary><pre>{{ JSON.stringify(ocrPayload, null, 2) }}</pre></details>
      </template>
      <p v-else class="signal-empty">暂无 OCR 结果。</p>
    </section>
  </div>
</template>

<style scoped>
.signals-grid {
  container-type: inline-size;
  display: grid;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  gap: var(--space-4);
  box-sizing: border-box;
}
.signals-grid--stacked {
  grid-template-columns: minmax(0, 1fr);
}
.signal-panel {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface-raised);
  box-shadow: var(--elevation-1);
  box-sizing: border-box;
}
.signal-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.signal-kicker {
  margin: 0 0 var(--space-1);
  color: var(--quiet);
  font-size: var(--type-caption-size);
  font-weight: 500;
  letter-spacing: .06em;
}
.signal-panel__header h3 {
  margin: 0;
  font-size: var(--type-label-size);
  font-weight: 700;
  letter-spacing: -.02em;
}
.signal-reason {
  margin: 0 0 var(--space-3);
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  line-height: 1.5;
}
.match-candidates {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}
.signals-grid--stacked .match-candidates {
  grid-template-columns: minmax(0, 1fr);
}
.match-candidate {
  display: grid;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  color: var(--text);
  background: var(--surface);
  text-align: left;
  box-sizing: border-box;
}
.match-candidate:hover,
.match-candidate--selected {
  border-color: color-mix(in oklch, var(--accent) 64%, var(--line));
  background: var(--accent-surface);
}
.match-candidate:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
.match-candidate:disabled {
  cursor: wait;
  opacity: .68;
}
.match-candidate__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.match-candidate__title strong {
  overflow-wrap: anywhere;
  font-size: var(--type-label-sm-size);
}
.candidate-scope {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: var(--type-caption-size);
}
.match-candidate__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.candidate-reward,
.candidate-current {
  color: var(--success);
  font-size: var(--type-caption-size);
  font-weight: 600;
}
.candidate-current {
  color: var(--accent);
}
.candidate-selection {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-top: var(--space-3);
}
.candidate-selection :deep(button) {
  min-height: 42px;
  max-width: 100%;
}
.manual-add,
.field-review {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line);
}
.manual-add :deep(button) {
  justify-self: start;
}
.field-review h4,
.field-review p {
  margin: 0;
}
.field-review h4 {
  font-size: var(--type-label-sm-size);
}
.field-review p {
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.signal-empty {
  margin: 0;
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  line-height: 1.5;
}
.signal-note,
.signal-error {
  margin: var(--space-3) 0 0;
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.signal-error {
  color: var(--danger);
}
.signal-meta,
.ocr-fields {
  display: grid;
  gap: 0;
  margin: 0;
}
.signal-meta > div,
.ocr-fields > div {
  display: grid;
  grid-template-columns: minmax(74px, .35fr) minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--line);
}
.signal-meta > div:last-child,
.ocr-fields > div:last-child {
  border-bottom: 0;
}
.signal-meta dt,
.ocr-fields dt {
  color: var(--muted);
  font-size: var(--type-caption-size);
}
.signal-meta dd,
.ocr-fields dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--type-caption-size);
  text-align: right;
}
.ocr-fields dd {
  display: grid;
  justify-items: end;
  gap: var(--space-1);
}
.ocr-field-value {
  display: block;
  color: var(--text);
  font-weight: 600;
}
.ocr-field-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
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
.ocr-achievement-evidence dd {
  display: grid;
  justify-items: end;
  gap: var(--space-1);
}
.ocr-panel details {
  margin-top: var(--space-3);
}
.ocr-panel pre {
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
@container (max-width: 23.99rem) {
  .signals-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .match-candidates {
    grid-template-columns: minmax(0, 1fr);
  }
  .signal-panel {
    padding: var(--space-4);
  }
  .signal-meta > div,
  .ocr-fields > div {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-1);
  }
  .signal-meta dd,
  .ocr-fields dd {
    text-align: left;
    justify-items: start;
  }
  .ocr-field-meta {
    justify-content: flex-start;
  }
  .candidate-selection {
    justify-content: stretch;
  }
  .candidate-selection :deep(button) {
    width: 100%;
    min-height: var(--control-lg);
  }
}
</style>
