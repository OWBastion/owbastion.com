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
const primaryFieldKeys: readonly string[] = ["map_name", "difficulty", "viewer_player", "challenge_completed", "map_variant", "achievement_titles"];
// Fields a still-unconfirmed Challenge is waiting for, so the table can point at what needs checking.
const neededFields = computed(() => new Set<string>(candidates.value.filter((candidate) => candidate.evidence === "needs_confirmation" && candidate.selectedBy === null).flatMap((candidate) => candidate.missingFields)));
const showExtraFields = ref(false);
const fieldRows = computed(() => annotatableFields.map((field) => {
  const ocr = ocrPayload.value?.fields?.[field.key];
  const raw = ocr?.value ?? ocrPayload.value?.data?.[field.key];
  const attested = confirmedFields.value.includes(field.key);
  const isPanel = field.key === "achievement_titles";
  return {
    ...field,
    primary: primaryFieldKeys.includes(field.key),
    text: isPanel ? achievementPanelLabel.value : ocrDisplayValue(field.key, raw),
    // The panel and the map version always read as something ("无", the standard version); only truly absent values invite typing one in.
    recognized: isPanel || field.key === "map_variant" || (raw !== null && raw !== undefined),
    confidence: ocr?.confidence,
    status: ocr?.status,
    attested,
    needed: neededFields.value.has(field.key) && !attested,
    changed: attested && (correctionInputs[field.key] ?? "") !== (initialInputs[field.key] ?? ""),
  };
}));
const visibleFieldRows = computed(() => fieldRows.value.filter((row) => row.primary || showExtraFields.value || row.attested || row.needed));
const extraFieldCount = computed(() => fieldRows.value.filter((row) => !row.primary).length);
const pendingFieldCount = computed(() => fieldRows.value.filter((row) => row.needed).length);
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
        <ul v-if="searchResults.length" class="manual-add__results">
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
    </section>

    <section class="signal-panel check-panel" aria-labelledby="check-title">
      <header class="signal-panel__header">
        <div>
          <p class="signal-kicker">OCRKit</p>
          <h3 id="check-title">识别核对</h3>
        </div>
        <div class="check-summary">
          <span v-if="pendingFieldCount" class="check-pending">{{ pendingFieldCount }} 项待核对</span>
          <StatusBadge :label="ocrStatusLabel(submission.ocrStatus)" :tone="ocrStatusTone(submission.ocrStatus)" />
        </div>
      </header>
      <p class="signal-note check-note">对照截图逐项核对。核对或修改后的值会随审核决定保存，批准时平台会据此重新判定 Verified Run 与全部 Challenge Conditions。</p>
      <p v-if="submission.ocrErrorCode" class="signal-error" role="status">识别错误：{{ submission.ocrErrorCode }}</p>
      <p v-if="Array.isArray(ocrPayload?.warnings) && ocrPayload.warnings.length" class="signal-note">告警：{{ ocrPayload.warnings.join("、") }}</p>
      <ul class="check-rows" aria-label="识别字段">
        <li v-for="row in visibleFieldRows" :key="row.key" class="check-row" :class="{ 'check-row--attested': row.attested }">
          <span class="check-row__label">{{ row.label }}</span>
          <span class="check-row__ocr">
            <strong class="ocr-field-value" :class="{ 'ocr-field-value--missing': !row.recognized }">{{ row.text }}</strong>
            <span class="ocr-field-meta">
              <span v-if="hasOcrConfidence(row.confidence)" class="ocr-confidence">{{ ocrConfidence(row.confidence) }}</span>
              <StatusBadge v-if="row.status" :label="ocrFieldStatusLabel(row.status)" :tone="ocrFieldStatusTone(row.status)" />
              <StatusBadge v-if="row.needed" label="待核对" tone="warning" />
            </span>
          </span>
          <span class="check-row__verify">
            <UButton v-if="!row.attested" type="button" icon="i-lucide-check" :label="row.recognized ? '核对' : '填写'" size="sm" color="neutral" variant="outline" :aria-label="`${row.recognized ? '核对' : '填写'}${row.label}`" :disabled="disabled" @click="toggleFieldConfirmation(row.key, true)" />
            <template v-else>
              <USelectMenu v-if="row.key === 'achievement_titles'" v-model="selectedTitles" multiple :items="withCurrent(titleNames, selectedTitles)" :aria-label="`截图中的${row.label}完整值`" placeholder="选择截图中的全部成就" :disabled="disabled" />
              <UInput v-else-if="row.key in typedFieldPlaceholder" v-model="correctionInputs[row.key]" :inputmode="['duration_seconds', 'deaths', 'skips'].includes(row.key) ? 'numeric' : 'text'" :aria-label="`截图中的${row.label}`" :placeholder="typedFieldPlaceholder[row.key]" :disabled="disabled" />
              <USelect v-else v-model="correctionInputs[row.key]" :items="fieldChoices(row.key)" :aria-label="`截图中的${row.label}完整值`" :placeholder="`选择截图中的${row.label}`" :disabled="disabled" />
              <span class="check-row__state">
                <StatusBadge :label="row.changed ? '已校正' : '已核对'" tone="success" />
                <UButton type="button" icon="i-lucide-undo-2" size="sm" color="neutral" variant="ghost" :aria-label="`撤销核对${row.label}`" :disabled="disabled" @click="toggleFieldConfirmation(row.key, false)" />
              </span>
            </template>
          </span>
        </li>
      </ul>
      <UButton v-if="extraFieldCount" type="button" class="check-more" size="sm" color="neutral" variant="ghost" :icon="showExtraFields ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" :label="showExtraFields ? '收起更多字段' : `更多字段（${extraFieldCount}）`" :aria-expanded="showExtraFields" @click="showExtraFields = !showExtraFields" />
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
.manual-add {
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
.manual-add__results {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
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
.check-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}
.check-pending {
  color: var(--warning);
  font-size: var(--type-caption-size);
  font-weight: 600;
}
.check-note {
  margin-top: 0;
}
.check-rows {
  display: grid;
  margin: var(--space-3) 0 0;
  padding: 0;
  list-style: none;
}
.check-row {
  display: grid;
  grid-template-columns: minmax(5.5rem, .32fr) minmax(0, .8fr) minmax(0, 1fr);
  gap: var(--space-2) var(--space-3);
  align-items: center;
  min-width: 0;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}
.check-row__label {
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  font-weight: 500;
}
.check-row__ocr {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  min-width: 0;
}
.check-row__verify {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
  min-width: 0;
}
.check-row__verify > :is(input, select, [role="combobox"]) {
  flex: 1 1 8rem;
  min-width: 0;
}
.check-row__state {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.check-more {
  margin-top: var(--space-2);
}
.ocr-field-value {
  overflow-wrap: anywhere;
  font-size: var(--type-label-size);
}
.ocr-field-value--missing {
  color: var(--quiet);
  font-weight: 500;
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
/* Narrow rail: label and recognized value on the left, the check action on the right; a row being edited gives the control the full width. */
@container (max-width: 35.99rem) {
  .check-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "label verify"
      "ocr verify";
    gap: var(--space-1) var(--space-3);
  }
  .check-row__label { grid-area: label; }
  .check-row__ocr { grid-area: ocr; }
  .check-row__verify { grid-area: verify; }
  .check-row--attested {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "label"
      "ocr"
      "verify";
  }
  .check-row--attested .check-row__verify {
    justify-content: flex-start;
  }
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
  .signal-meta > div {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-1);
  }
  .signal-meta dd {
    text-align: left;
    justify-items: start;
  }
}
</style>
