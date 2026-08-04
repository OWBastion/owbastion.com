<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";

type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };
type MatchCandidate = {
  challengeId?: string;
  mapId?: string;
  challengeType?: string;
  targetMapName?: string;
  targetDifficulty?: string | null;
  titleName?: string | null;
  requiredMapVariant?: "classic" | null;
  match?: Record<string, unknown>;
  quality?: { accepted?: boolean; reasons?: string[] };
  grantable?: boolean;
};

const props = defineProps<{ submission: AdminSubmission; challengeSelectionError?: string; challengeSelectionLoading?: boolean }>();
const emit = defineEmits<{ "select-challenge": [selection: { challengeId: string; mapId?: string }] }>();

const ocrLabels: Record<string, string> = { map_name: "地图", map_variant: "地图版本", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记" };
const ocrPayload = computed(() => props.submission.ocr as OcrPayload | null);
const ocrFields = computed(() => Object.entries(ocrPayload.value?.fields ?? {}).filter(([name]) => name in ocrLabels));
const matchPayload = computed(() => props.submission.match as { outcome?: string; candidates?: MatchCandidate[] } | undefined | null);
const candidates = computed(() => matchPayload.value?.candidates ?? []);
const normalized = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
const recognizedMapName = computed(() => normalized(ocrPayload.value?.data?.map_name) || normalized(props.submission.mapName));
const visibleCandidates = computed(() => candidates.value.filter((candidate) => {
  if (candidate.titleName && candidate.match?.achievement !== true) return false;
  if (candidate.mapId && candidate.targetMapName && recognizedMapName.value) return normalized(candidate.targetMapName) === recognizedMapName.value;
  return true;
}));
const checkedTitles = computed(() => Array.isArray(ocrPayload.value?.data?.achievement_titles) ? ocrPayload.value?.data?.achievement_titles.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []);
const panelText = computed(() => typeof ocrPayload.value?.data?.achievement_panel_text === "string" ? ocrPayload.value.data.achievement_panel_text.trim() : "");
const hasCheckedTitle = computed(() => checkedTitles.value.length > 0 || /[✓✔√☑]/u.test(panelText.value));
const selectedCandidateId = ref("");

const ocrValue = (value: unknown) => value === null || value === undefined ? "未识别" : value === true ? "已识别完成" : value === false ? "未识别完成" : String(value);
const ocrConfidence = (value: unknown) => typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
const matchOutcomeLabel = (outcome?: string) => outcome === "automatic" ? "已自动判定" : outcome === "review" ? "转人工核对" : outcome === "resubmit" ? "需重新提交" : "已记录判定";
const candidateResultLabel = (candidate: MatchCandidate) => {
  const label = candidate.titleName || candidate.targetDifficulty && `${candidate.targetMapName} · ${candidate.targetDifficulty}` || candidate.targetMapName || candidate.challengeId || "候选挑战";
  return candidate.requiredMapVariant === "classic" ? `${label} · 经典版` : label;
};
const candidateScopeLabel = (candidate: MatchCandidate) => candidate.titleName ? candidate.challengeType === "map_title_achievement" ? "地图称号" : "成就挑战" : "地图挑战";
const candidateKey = (candidate: MatchCandidate) => `${candidate.challengeId ?? ""}:${candidate.mapId ?? ""}`;
watch([() => props.submission.challengeId, visibleCandidates], ([challengeId, candidates]) => {
  const currentCandidate = candidates.find((candidate) => candidate.challengeId === challengeId && (!candidate.mapId || normalized(candidate.targetMapName) === normalized(props.submission.mapName)));
  selectedCandidateId.value = currentCandidate ? candidateKey(currentCandidate) : challengeId || "";
}, { immediate: true });
const candidateStatusLabel = (candidate: MatchCandidate) => {
  if (candidate.titleName && candidate.match?.achievement !== true) return "无勾选证据";
  const booleanMatches = Object.entries(candidate.match ?? {}).filter(([, value]) => typeof value === "boolean").map(([, value]) => value);
  if (candidate.quality?.accepted && booleanMatches.length > 0 && booleanMatches.every(Boolean)) return "匹配";
  if (candidate.quality?.accepted) return "需核对";
  return "低置信度";
};
const candidateStatusTone = (candidate: MatchCandidate): "success" | "warning" => candidateStatusLabel(candidate) === "匹配" ? "success" : "warning";
const selectedCandidate = computed(() => visibleCandidates.value.find((candidate) => candidateKey(candidate) === selectedCandidateId.value) ?? null);
const isCurrentCandidate = (candidate: MatchCandidate) => candidate.challengeId === props.submission.challengeId && (!candidate.mapId || normalized(candidate.targetMapName) === normalized(props.submission.mapName));
const selectCandidate = (candidate: MatchCandidate) => { selectedCandidateId.value = candidateKey(candidate); };
const saveSelectedCandidate = () => {
  if (!selectedCandidate.value?.challengeId || props.challengeSelectionLoading) return;
  emit("select-challenge", { challengeId: selectedCandidate.value.challengeId, ...(selectedCandidate.value.mapId ? { mapId: selectedCandidate.value.mapId } : {}) });
};
</script>

<template>
  <div class="signals-grid" aria-label="自动判定与 OCR 证据">
    <section v-if="matchPayload" class="signal-panel match-panel" aria-labelledby="auto-match-title">
      <header class="signal-panel__header">
        <div>
          <h3 id="auto-match-title">自动判定</h3>
        </div>
        <StatusBadge :label="matchOutcomeLabel(matchPayload.outcome)" :tone="matchPayload.outcome === 'automatic' ? 'success' : 'warning'" />
      </header>
      <p v-if="submission.reason" class="signal-reason">{{ submission.reason }}</p>
      <div v-if="visibleCandidates.length" class="match-candidates">
        <button v-for="candidate in visibleCandidates" :key="candidateKey(candidate)" class="match-candidate pressable-soft" :class="{ 'match-candidate--selected': selectedCandidateId === candidateKey(candidate) }" type="button" :aria-pressed="selectedCandidateId === candidateKey(candidate)" :disabled="challengeSelectionLoading" @click="selectCandidate(candidate)">
          <div class="match-candidate__title">
            <strong>{{ candidateResultLabel(candidate) }}</strong>
            <span class="candidate-scope">{{ candidateScopeLabel(candidate) }}</span>
          </div>
          <div class="match-candidate__meta"><StatusBadge :label="candidateStatusLabel(candidate)" :tone="candidateStatusTone(candidate)" /><span v-if="candidate.grantable" class="candidate-reward">可获得称号</span></div>
          <span v-if="isCurrentCandidate(candidate)" class="candidate-current">当前挑战</span>
        </button>
      </div>
      <p v-else class="signal-empty">暂无可选挑战</p>
      <div v-if="selectedCandidate && !isCurrentCandidate(selectedCandidate)" class="candidate-selection">
        <UButton class="pressable" type="button" label="设为当前挑战" icon="i-lucide-check" color="primary" :loading="challengeSelectionLoading" :disabled="challengeSelectionLoading" @click="saveSelectedCandidate" />
      </div>
      <p v-if="challengeSelectionError" class="signal-error" role="alert">{{ challengeSelectionError }}</p>
    </section>

    <section class="signal-panel ocr-panel" aria-labelledby="ocr-title">
      <header class="signal-panel__header">
        <div>
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
          <div v-for="[name, field] in ocrFields" :key="name"><dt>{{ ocrLabels[name] }}</dt><dd>{{ ocrValue(field.value ?? ocrPayload.data?.[name]) }} <small>{{ ocrConfidence(field.confidence) }} · {{ field.status ?? "unknown" }}</small></dd></div>
          <div v-if="ocrPayload.data?.map_variant !== undefined && !ocrFields.some(([name]) => name === 'map_variant')"><dt>地图版本</dt><dd>{{ ocrValue(ocrPayload.data.map_variant) }} <small>OCR 数据</small></dd></div>
          <div class="ocr-achievement-evidence"><dt>称号证据</dt><dd><strong>{{ checkedTitles.length ? checkedTitles.join("、") : "未检测到带勾称号" }}</strong><StatusBadge :label="hasCheckedTitle ? '有勾选证据' : '无勾选证据'" :tone="hasCheckedTitle ? 'success' : 'warning'" /></dd></div>
        </dl>
        <p v-if="Array.isArray(ocrPayload.warnings) && ocrPayload.warnings.length" class="signal-note">告警：{{ ocrPayload.warnings.join("、") }}</p>
        <details><summary>查看原始识别数据</summary><pre>{{ JSON.stringify(ocrPayload, null, 2) }}</pre></details>
      </template>
      <p v-else class="signal-empty">暂无 OCR 结果。</p>
    </section>
  </div>
</template>

<style scoped>
.signals-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: 16px; }
.signal-panel { min-width: 0; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-raised); box-shadow: var(--elevation-1); }
.signal-panel__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.signal-panel__header h3 { margin: 0; font-size: .96rem; font-weight: 720; letter-spacing: -.02em; }
.signal-panel__header p { margin: 4px 0 0; color: var(--muted); font-size: .75rem; line-height: 1.4; }
.signal-reason { margin: 0 0 12px; color: var(--muted); font-size: .82rem; line-height: 1.5; }
.match-candidates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.match-candidate { display: grid; min-width: 0; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); background: var(--surface); text-align: left; }
.match-candidate:hover, .match-candidate--selected { border-color: color-mix(in oklch, var(--accent) 64%, var(--line)); background: var(--accent-surface); }
.match-candidate:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.match-candidate:disabled { cursor: wait; opacity: .68; }
.match-candidate__title { display: flex; align-items: center; gap: 7px; min-width: 0; }
.match-candidate__title strong { overflow-wrap: anywhere; font-size: .82rem; }
.candidate-scope { flex: 0 0 auto; color: var(--muted); font-size: .68rem; }
.match-candidate__meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.candidate-reward, .candidate-current { color: var(--success); font-size: .68rem; font-weight: 650; }
.candidate-current { color: var(--accent); }
.candidate-selection { display: flex; justify-content: flex-end; margin-top: 12px; }
.candidate-selection :deep(button) { min-height: 42px; }
.signal-empty { margin: 0; color: var(--muted); font-size: .8rem; line-height: 1.5; }
.signal-note, .signal-error { margin: 12px 0 0; color: var(--muted); font-size: .72rem; line-height: 1.5; overflow-wrap: anywhere; }
.signal-error { color: var(--danger); }
.signal-meta, .ocr-fields { display: grid; gap: 0; margin: 0; }
.signal-meta > div, .ocr-fields > div { display: grid; grid-template-columns: minmax(74px, .35fr) minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.signal-meta > div:last-child, .ocr-fields > div:last-child { border-bottom: 0; }
.signal-meta dt, .ocr-fields dt { color: var(--muted); font-size: .75rem; }
.signal-meta dd, .ocr-fields dd { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: .78rem; text-align: right; }
.ocr-fields small { display: block; margin-top: 2px; color: var(--muted); font-size: .68rem; }
.ocr-achievement-evidence dd { display: grid; justify-items: end; gap: 5px; }
.ocr-achievement-evidence dd strong { display: block; color: var(--text); font-weight: 680; }
.ocr-panel details { margin-top: 12px; }
.ocr-panel pre { max-height: 220px; overflow: auto; margin: 8px 0 0; padding: 10px; color: var(--muted); background: var(--surface); font-size: .68rem; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) { .signals-grid { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .match-candidates { grid-template-columns: 1fr; } .signal-panel { padding: 14px; } }
</style>
