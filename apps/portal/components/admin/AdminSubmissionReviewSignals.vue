<script setup lang="ts">
import type { AdminSubmission, AdminSubmissionReviewCandidate, AdminSubmissionReviewPreview } from "~/composables/useAdminApi";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";
import { mapVariantLabel } from "~/utils/map-variant";
import { reviewCandidateScopeLabel, reviewCandidateSearchText, reviewCandidateStatus, reviewFieldList } from "~/utils/submissionReview";

type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };

const props = defineProps<{ submission: AdminSubmission; preview?: AdminSubmissionReviewPreview | null; previewLoading?: boolean; stacked?: boolean; disabled?: boolean }>();
const emit = defineEmits<{
  "field-corrections": [value: Array<{ fieldKey: string; reviewedValue: string }>];
  "confirmed-challenges": [value: string[]];
}>();

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

const confirmedChallengeIds = ref<string[]>([]);
const withdrawnConfirmations = ref(0);
watch(confirmedChallengeIds, (value) => emit("confirmed-challenges", value), { immediate: true });
const setChallengeConfirmation = (challengeId: string, confirmed: boolean) => {
  withdrawnConfirmations.value = 0;
  confirmedChallengeIds.value = confirmed ? [...new Set([...confirmedChallengeIds.value, challengeId])] : confirmedChallengeIds.value.filter((id) => id !== challengeId);
};
const candidates = computed(() => props.preview?.candidates ?? []);
// Corrected evidence can change which Challenges are eligible (for example another map);
// confirmations that no longer apply are withdrawn so they cannot block approval invisibly.
watch(() => props.preview, (preview) => {
  if (!preview) return;
  const eligible = new Set(preview.candidates.map((candidate) => candidate.challengeId));
  const kept = confirmedChallengeIds.value.filter((id) => eligible.has(id));
  if (kept.length === confirmedChallengeIds.value.length) return;
  withdrawnConfirmations.value = confirmedChallengeIds.value.length - kept.length;
  confirmedChallengeIds.value = kept;
});
const isProposed = (candidate: AdminSubmissionReviewCandidate) => candidate.evidence === "matched" || candidate.evidence === "needs_confirmation";
// Proposed candidates stay listed after confirmation; manually added ones join them while confirmed.
const listedCandidates = computed(() => candidates.value.filter((candidate) => isProposed(candidate) || confirmedChallengeIds.value.includes(candidate.challengeId)));
const challengeQuery = ref("");
const searchResults = computed(() => {
  const query = challengeQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  const listed = new Set(listedCandidates.value.map((candidate) => candidate.challengeId));
  return candidates.value.filter((candidate) => !listed.has(candidate.challengeId) && reviewCandidateSearchText(candidate).includes(query)).slice(0, 8);
});
const addChallenge = (challengeId: string) => {
  setChallengeConfirmation(challengeId, true);
  challengeQuery.value = "";
};
const candidateDetail = (candidate: AdminSubmissionReviewCandidate) => [candidate.mapName && candidate.kind !== "title_achievement" ? candidate.mapName : null, candidate.difficulty].filter(Boolean).join(" · ");

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
const matchOutcomeLabel = (outcome?: string) => outcome === "automatic" ? "证据满足条件" : outcome === "review" ? "证据需人工确认" : outcome === "resubmit" ? "未匹配 Challenge" : "等待判定";
</script>

<template>
  <div class="signals-grid" :class="{ 'signals-grid--stacked': stacked }" aria-label="自动判定与 OCR 证据">
    <section class="signal-panel match-panel" aria-labelledby="auto-match-title">
      <header class="signal-panel__header">
        <div>
          <p class="signal-kicker">核对</p>
          <h3 id="auto-match-title">Challenge 判定</h3>
        </div>
        <StatusBadge v-if="preview" :label="matchOutcomeLabel(preview.evidenceOutcome)" :tone="preview.evidenceOutcome === 'automatic' ? 'success' : 'warning'" />
      </header>
      <p v-if="submission.reason" class="signal-reason">{{ submission.reason }}</p>
      <p class="signal-note">列表只包含提交时有效、且玩家尚未拥有的 Challenge。识别不完整但截图能证明时，勾选“截图可证明”；批准前可在“通过后将产生”中核对结果。</p>
      <div v-if="listedCandidates.length" class="match-candidates">
        <article v-for="candidate in listedCandidates" :key="candidate.challengeId" class="match-candidate" :class="{ 'match-candidate--selected': candidate.selectedBy !== null }">
          <div class="match-candidate__title">
            <strong>{{ candidate.label }}</strong>
            <span class="candidate-scope">{{ reviewCandidateScopeLabel(candidate) }}</span>
          </div>
          <p v-if="candidateDetail(candidate)" class="candidate-reasons">{{ candidateDetail(candidate) }}</p>
          <p v-if="candidate.condition" class="candidate-condition">{{ candidate.condition }}</p>
          <div class="match-candidate__meta">
            <StatusBadge :label="reviewCandidateStatus(candidate).label" :tone="reviewCandidateStatus(candidate).tone" />
            <span v-if="candidate.requiredFields.length" class="candidate-reasons">依据：{{ reviewFieldList(candidate.requiredFields) }}</span>
          </div>
          <UCheckbox
            v-if="candidate.evidence !== 'matched'"
            :model-value="confirmedChallengeIds.includes(candidate.challengeId)"
            label="截图可证明"
            :disabled="disabled"
            @update:model-value="setChallengeConfirmation(candidate.challengeId, Boolean($event))"
          />
        </article>
      </div>
      <p v-if="withdrawnConfirmations" class="signal-note" role="status">{{ withdrawnConfirmations }} 项人工确认已不适用于当前识别结果，已取消。</p>
      <p v-if="!listedCandidates.length && previewLoading && !preview" class="signal-empty">正在计算 Challenge…</p>
      <p v-else-if="!listedCandidates.length && preview" class="signal-empty">当前证据没有匹配到 Challenge，可以在下方搜索添加。</p>
      <p v-else-if="!listedCandidates.length" class="signal-empty">暂无可判定的识别结果。</p>
      <section v-if="candidates.length" class="manual-add" aria-labelledby="manual-add-title">
        <h4 id="manual-add-title">搜索并添加 Challenge</h4>
        <UInput v-model="challengeQuery" icon="i-lucide-search" aria-label="搜索 Challenge" placeholder="输入称号、地图或条件" :disabled="disabled" />
        <ul v-if="searchResults.length" class="manual-add__results stacked-list">
          <li v-for="candidate in searchResults" :key="candidate.challengeId" class="manual-add__result">
            <div>
              <strong>{{ candidate.label }}</strong>
              <span class="candidate-scope">{{ reviewCandidateScopeLabel(candidate) }}<template v-if="candidateDetail(candidate)"> · {{ candidateDetail(candidate) }}</template></span>
            </div>
            <UButton type="button" label="添加" size="sm" color="neutral" variant="outline" :disabled="disabled" :aria-label="`添加 ${candidate.label}`" @click="addChallenge(candidate.challengeId)" />
          </li>
        </ul>
        <p v-else-if="challengeQuery.trim()" class="signal-empty">没有匹配的 Challenge。已拥有或已被管理员撤销的称号不会出现在列表中。</p>
      </section>
      <section class="field-review" aria-labelledby="field-review-title">
        <div>
          <h4 id="field-review-title">校正识别字段</h4>
          <p>勾选并填写截图中的完整值后，会作为本次审核的业务校正随决定保存。批准时平台会用校正后的结构化证据重新判定 Verified Run 与全部 Challenge Conditions。</p>
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
.match-candidate--selected {
  border-color: color-mix(in oklch, var(--accent) 64%, var(--line));
  background: var(--accent-surface);
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.manual-add,
.field-review {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line);
}
.manual-add h4 {
  margin: 0;
  font-size: var(--type-label-sm-size);
}
.manual-add__result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface);
}
.manual-add__result > div {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}
.manual-add__result strong {
  overflow-wrap: anywhere;
  font-size: var(--type-label-sm-size);
}
.candidate-reasons,
.candidate-condition {
  margin: 0;
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.candidate-condition {
  color: var(--text);
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
.signal-note {
  margin: var(--space-3) 0 0;
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
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
}
</style>
