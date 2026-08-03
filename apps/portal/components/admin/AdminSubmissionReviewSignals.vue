<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";

type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };
type MatchCandidate = {
  challengeId?: string;
  challengeType?: string;
  targetMapName?: string;
  targetDifficulty?: string | null;
  titleName?: string | null;
  requiredMapVariant?: "classic" | null;
  match?: Record<string, unknown>;
  quality?: { accepted?: boolean; reasons?: string[] };
  grantable?: boolean;
};

const props = defineProps<{ submission: AdminSubmission }>();

const ocrLabels: Record<string, string> = { map_name: "地图", map_variant: "地图版本", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记" };
const ocrPayload = computed(() => props.submission.ocr as OcrPayload | null);
const ocrFields = computed(() => Object.entries(ocrPayload.value?.fields ?? {}).filter(([name]) => name in ocrLabels));
const matchPayload = computed(() => props.submission.match as { outcome?: string; candidates?: MatchCandidate[] } | undefined | null);
const candidates = computed(() => matchPayload.value?.candidates ?? []);
const normalized = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
const recognizedMapName = computed(() => normalized(ocrPayload.value?.data?.map_name) || normalized(props.submission.mapName));
const visibleCandidates = computed(() => candidates.value.filter((candidate) => {
  if (candidate.titleName && candidate.match?.achievement !== true) return false;
  if (candidate.targetMapName && recognizedMapName.value) return normalized(candidate.targetMapName) === recognizedMapName.value;
  return true;
}));
const hiddenCandidateCount = computed(() => candidates.value.length - visibleCandidates.value.length);
const hiddenTitleCandidateCount = computed(() => candidates.value.filter((candidate) => Boolean(candidate.titleName) && candidate.match?.achievement !== true).length);
const hiddenMapCandidateCount = computed(() => candidates.value.filter((candidate) => !candidate.titleName && candidate.targetMapName && !visibleCandidates.value.includes(candidate)).length);
const checkedTitles = computed(() => Array.isArray(ocrPayload.value?.data?.achievement_titles) ? ocrPayload.value?.data?.achievement_titles.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []);
const panelText = computed(() => typeof ocrPayload.value?.data?.achievement_panel_text === "string" ? ocrPayload.value.data.achievement_panel_text.trim() : "");
const hasCheckedTitle = computed(() => checkedTitles.value.length > 0 || /[✓✔√☑]/u.test(panelText.value));

const ocrValue = (value: unknown) => value === null || value === undefined ? "未识别" : value === true ? "已识别完成" : value === false ? "未识别完成" : String(value);
const ocrConfidence = (value: unknown) => typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
const matchOutcomeLabel = (outcome?: string) => outcome === "automatic" ? "已自动判定" : outcome === "review" ? "转人工核对" : outcome === "resubmit" ? "需重新提交" : "已记录判定";
const candidateResultLabel = (candidate: MatchCandidate) => {
  const label = candidate.titleName || candidate.targetDifficulty && `${candidate.targetMapName} · ${candidate.targetDifficulty}` || candidate.targetMapName || candidate.challengeId || "候选挑战";
  return candidate.requiredMapVariant === "classic" ? `${label} · 经典版` : label;
};
const candidateScopeLabel = (candidate: MatchCandidate) => candidate.challengeType === "map_title_achievement" ? "当前地图称号" : candidate.challengeType === "title_achievement" ? "通用称号" : "地图挑战";
const candidateStatus = (candidate: MatchCandidate) => {
  if (candidate.titleName && candidate.match?.achievement !== true) return "未检测到目标称号勾选";
  if (candidate.quality?.accepted && Object.entries(candidate.match ?? {}).filter(([, value]) => typeof value === "boolean").every(([, value]) => value === true)) return candidate.titleName ? "识别字段与称号证据均匹配" : "地图与通关证据均匹配";
  if (candidate.quality?.accepted) return candidate.titleName ? "识别字段完整，仍需核对称号证据" : "地图字段完整，仍需核对通关证据";
  return "需核对识别字段";
};
const candidateEmptyMessage = computed(() => {
  if (!candidates.value.length) return "没有可用的自动判定候选。";
  const reasons = [];
  if (hiddenMapCandidateCount.value) reasons.push("地图候选未匹配当前地图或地图识别证据不足");
  if (hiddenTitleCandidateCount.value) reasons.push("称号候选未发现带勾证据");
  return reasons.length ? `${reasons.join("；")}。` : "当前证据未匹配到可展示的候选。";
});
</script>

<template>
  <div class="signals-grid" aria-label="自动判定与 OCR 证据">
    <section v-if="matchPayload" class="signal-panel match-panel" aria-labelledby="auto-match-title">
      <header class="signal-panel__header">
        <div>
          <h3 id="auto-match-title">自动判定</h3>
          <p>只展示当前地图与实际出现的称号候选</p>
        </div>
        <StatusBadge :label="matchOutcomeLabel(matchPayload.outcome)" :tone="matchPayload.outcome === 'automatic' ? 'success' : 'warning'" />
      </header>
      <p v-if="submission.reason" class="signal-reason">{{ submission.reason }}</p>
      <div v-if="visibleCandidates.length" class="match-candidates">
        <div v-for="candidate in visibleCandidates" :key="candidate.challengeId" class="match-candidate">
          <div class="match-candidate__title">
            <strong>{{ candidateResultLabel(candidate) }}</strong>
            <span class="candidate-scope">{{ candidateScopeLabel(candidate) }}</span>
          </div>
          <p>{{ candidateStatus(candidate) }}<small v-if="candidate.grantable"> · 奖励已配置</small></p>
        </div>
      </div>
      <p v-else class="signal-empty">{{ candidateEmptyMessage }}</p>
      <p v-if="hiddenCandidateCount" class="signal-note">已隐藏 {{ hiddenCandidateCount }} 个不满足当前证据范围的候选；地图挑战不要求左侧称号勾选，称号挑战才需要带勾证据。</p>
    </section>

    <section class="signal-panel ocr-panel" aria-labelledby="ocr-title">
      <header class="signal-panel__header">
        <div>
          <h3 id="ocr-title">OCRKit</h3>
          <p>识别字段与原始证据</p>
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
          <div class="ocr-achievement-evidence"><dt>称号证据</dt><dd><strong>{{ checkedTitles.length ? checkedTitles.join("、") : "未检测到带勾称号" }}</strong><small>{{ hasCheckedTitle ? "来自成就面板" : "当前文本看起来是属性统计，不作为称号证据" }}</small></dd></div>
        </dl>
        <p v-if="panelText" class="ocr-raw-evidence">原始成就面板文本：{{ panelText }}</p>
        <p v-if="Array.isArray(ocrPayload.warnings) && ocrPayload.warnings.length" class="signal-note">告警：{{ ocrPayload.warnings.join("、") }}</p>
        <p class="signal-note">模型 {{ ocrPayload.model_version ?? "未知" }} · 请求 {{ ocrPayload.request_id ?? "未知" }}</p>
        <details><summary>查看原始 OCR 响应</summary><pre>{{ JSON.stringify(ocrPayload, null, 2) }}</pre></details>
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
.match-candidate { min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.match-candidate__title { display: flex; align-items: center; gap: 7px; min-width: 0; }
.match-candidate__title strong { overflow-wrap: anywhere; font-size: .82rem; }
.candidate-scope { flex: 0 0 auto; color: var(--muted); font-size: .68rem; }
.match-candidate p { margin: 5px 0 0; color: var(--muted); font-size: .74rem; line-height: 1.4; }
.match-candidate small { color: var(--success); }
.signal-empty { margin: 0; color: var(--muted); font-size: .8rem; line-height: 1.5; }
.signal-note, .ocr-raw-evidence { margin: 12px 0 0; color: var(--muted); font-size: .72rem; line-height: 1.5; overflow-wrap: anywhere; }
.signal-meta, .ocr-fields { display: grid; gap: 0; margin: 0; }
.signal-meta > div, .ocr-fields > div { display: grid; grid-template-columns: minmax(74px, .35fr) minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.signal-meta > div:last-child, .ocr-fields > div:last-child { border-bottom: 0; }
.signal-meta dt, .ocr-fields dt { color: var(--muted); font-size: .75rem; }
.signal-meta dd, .ocr-fields dd { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: .78rem; text-align: right; }
.ocr-fields small { display: block; margin-top: 2px; color: var(--muted); font-size: .68rem; }
.ocr-achievement-evidence dd strong { display: block; color: var(--text); font-weight: 680; }
.ocr-panel details { margin-top: 12px; }
.ocr-panel pre { max-height: 220px; overflow: auto; margin: 8px 0 0; padding: 10px; color: var(--muted); background: var(--surface); font-size: .68rem; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) { .signals-grid { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .match-candidates { grid-template-columns: 1fr; } .signal-panel { padding: 14px; } }
</style>
