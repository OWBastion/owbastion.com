<script setup lang="ts">
import type { PlayerSubmissionDetail } from "@owbastion/contracts";
import { portalErrorDetails } from "~/utils/portal-error";
import { verifiedRunOutcomePresentation } from "~/utils/mastery";
import OcrFeedbackPanel from "~/components/submissions/OcrFeedbackPanel.vue";
import SubmissionProgress from "~/components/submissions/SubmissionProgress.vue";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交详情 · 躲避堡垒 3" });

const route = useRoute();
const api = usePortalApi();
const submissionId = String(route.params.submissionId);
const { data, error, status: fetchStatus, refresh } = await useAsyncData(
  `player-submission:${submissionId}`,
  () => api<PlayerSubmissionDetail>(`/v1/me/submissions/${encodeURIComponent(submissionId)}`),
);
const requestingManualReview = shallowRef(false);
const refreshingStatus = shallowRef(false);
const manualReviewRequested = shallowRef(false);
const manualReviewError = shallowRef("");
const refreshError = shallowRef("");
const actionMessage = shallowRef("");
let ocrPollTimer: ReturnType<typeof setInterval> | null = null;
const evidenceState = shallowRef<"loading" | "ready" | "missing" | "failed">("loading");
const resubmissionTips = [
  { icon: "i-lucide-panels-top-left", title: "保留完整通关数据", description: "确保通关时间、击杀数和其他关键数据清晰可见。" },
  { icon: "i-lucide-clipboard-check", title: "包含挑战信息", description: "保留地图、难度和挑战相关信息。" },
  { icon: "i-lucide-scan-search", title: "提高画面清晰度", description: "建议使用原始截图，避免裁剪或压缩。" },
];

const ocrValue = (value: string | boolean | null) => value === null ? "未识别" : typeof value === "boolean" ? value ? "已识别完成" : "未识别完成" : value;
const manualReviewEligible = computed(() => data.value?.manualReviewEligible === true);
const verifiedRunOutcome = computed(() => verifiedRunOutcomePresentation(data.value?.verifiedRunOutcome));
const mutationBusy = computed(() => requestingManualReview.value || refreshingStatus.value);
// Status is carried by the badge and progress; the alert stays only for a distinct,
// actionable fact (a resubmission reason, or a granted title name).
const statusAlert = computed(() => {
  if (data.value?.resubmissionRequired) return { title: "需重新提交", description: data.value.reason ?? "请重新提交截图。", color: "warning" as const };
  if (data.value?.status === "rejected") return { title: "未通过", description: data.value.reason ?? "本次提交未通过核对。", color: "warning" as const };
  if (data.value?.titleGrant) return { title: "已获得称号", description: `「${data.value.titleGrant.titleName}」${data.value.titleGrant.mapName ? ` · ${data.value.titleGrant.mapName}` : ""}`, color: "success" as const };
  return null;
});
const evidenceDisplaySrc = computed(() => evidenceState.value === "ready" || evidenceState.value === "loading" ? data.value?.evidenceUrl ?? null : null);

const hasEvidenceSource = computed(() => Boolean(data.value?.evidenceUrl));

const handleRequestManualReview = async () => {
  if (requestingManualReview.value) return;
  requestingManualReview.value = true;
  manualReviewError.value = "";
  actionMessage.value = "";
  try {
    await api(`/v1/player/submissions/${encodeURIComponent(submissionId)}/manual-review`, { method: "POST" });
    manualReviewRequested.value = true;
    actionMessage.value = "已提交申请，请等待核对结果。";
    await refresh();
  } catch (cause) {
    manualReviewError.value = portalErrorDetails(cause, "无法申请人工核对，请稍后重试。").description;
  } finally {
    requestingManualReview.value = false;
  }
};

const refreshSubmission = async () => {
  if (refreshingStatus.value || fetchStatus.value === "pending") return;
  refreshingStatus.value = true;
  refreshError.value = "";
  actionMessage.value = "";
  try {
    // Explicit refresh keeps the current detail on failure instead of replacing the page with the route error state.
    data.value = await api<PlayerSubmissionDetail>(`/v1/me/submissions/${encodeURIComponent(submissionId)}`);
  } catch (cause) {
    refreshError.value = portalErrorDetails(cause, "无法刷新状态，请稍后重试。").description;
  } finally {
    refreshingStatus.value = false;
  }
};

const markEvidenceFailed = () => {
  evidenceState.value = hasEvidenceSource.value ? "failed" : "missing";
};

const loadEvidence = () => { evidenceState.value = hasEvidenceSource.value ? "ready" : "missing"; };

onMounted(() => {
  if (data.value?.status !== "processing") return;
  ocrPollTimer = setInterval(async () => {
    if (document.visibilityState === "hidden") return;
    if (fetchStatus.value === "pending" || mutationBusy.value) return;
    try { await refresh(); } catch { return; }
    if (data.value?.status !== "processing" && ocrPollTimer) {
      clearInterval(ocrPollTimer);
      ocrPollTimer = null;
    }
  }, 2000);
});
onMounted(() => { void loadEvidence(); });
onBeforeUnmount(() => { if (ocrPollTimer) clearInterval(ocrPollTimer); });
</script>

<template>
  <main class="submission-page page-shell">
    <NuxtLink to="/me" class="back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />玩家中心</NuxtLink>

    <header class="sub-hero">
      <div class="sub-hero__copy">
        <p class="eyebrow">Submission</p>
        <h1 class="sub-hero__title">{{ data?.mapName ?? "提交进度" }}<small v-if="data?.difficulty">{{ data.difficulty }}</small></h1>
        <p v-if="data" class="sub-hero__meta"><span>提交于 {{ formatTime(data.createdAt) }}</span><span>最后更新 {{ formatTime(data.updatedAt) }}</span></p>
      </div>
      <StatusBadge v-if="data" class="sub-hero__status" :label="playerSubmissionStatusLabel(data.status, data.resubmissionRequired)" :tone="playerSubmissionStatusTone(data.status, data.resubmissionRequired)" />
    </header>

    <p v-if="error && !data" class="message" role="alert">找不到这条提交记录。</p>
    <p v-else-if="fetchStatus === 'pending' && !data" class="message" role="status">读取提交详情…</p>
    <template v-else-if="data">
      <!-- Steady submission state: visible only, never live-announced on poll/refresh. -->
      <UAlert
        v-if="statusAlert"
        :icon="statusAlert.color === 'warning' ? 'i-lucide-triangle-alert' : statusAlert.color === 'success' ? 'i-lucide-badge-check' : 'i-lucide-scan-line'"
        :color="statusAlert.color"
        variant="subtle"
        :title="statusAlert.title"
        :description="statusAlert.description"
      />
      <!-- Single live region for ephemeral mutation feedback only (one visible + announced path). -->
      <div v-if="manualReviewError || refreshError || actionMessage" class="status-live" aria-live="polite" aria-atomic="true">
        <UAlert v-if="manualReviewError" color="error" variant="subtle" title="无法申请人工核对" :description="manualReviewError" />
        <UAlert v-else-if="refreshError" color="error" variant="subtle" title="无法刷新状态" :description="refreshError" />
        <UAlert v-else-if="actionMessage" color="success" variant="subtle" :title="actionMessage" />
      </div>

      <SubmissionProgress :status="data.status" :updated-at="data.updatedAt" :resubmission-required="data.resubmissionRequired" />

      <section class="submission-layout">
        <div class="evidence-col">
          <section class="evidence-frame" aria-labelledby="evidence-title">
            <h2 id="evidence-title" class="sr-only">提交截图</h2>
            <img
              v-if="evidenceDisplaySrc && evidenceState !== 'failed' && evidenceState !== 'missing'"
              :src="evidenceDisplaySrc"
              :alt="`${data.mapName}的提交截图`"
              class="evidence-image"
              @error="markEvidenceFailed"
            />
            <p v-else-if="evidenceState === 'loading'" class="evidence-message" role="status">读取中…</p>
            <p v-else-if="evidenceState === 'missing'" class="evidence-message" role="status"><UIcon name="i-lucide-image-off" aria-hidden="true" />暂无截图</p>
            <p v-else class="evidence-message" role="alert"><UIcon name="i-lucide-image-off" aria-hidden="true" />无法读取截图，请稍后重试。</p>
          </section>
        </div>

        <div class="info-col">
          <section class="panel" aria-labelledby="overview-title">
            <h2 id="overview-title" class="panel__title">提交概览</h2>
            <dl class="detail-grid">
              <div class="detail-grid__row"><dt>提交编号</dt><dd class="mono">{{ data.submissionId }}</dd></div>
              <div v-if="data.difficulty" class="detail-grid__row"><dt>难度</dt><dd>{{ data.difficulty }}</dd></div>
              <div v-if="data.reason && !data.resubmissionRequired" class="detail-grid__row"><dt>说明</dt><dd>{{ data.reason }}</dd></div>
            </dl>
            <UAlert v-if="verifiedRunOutcome" :color="data.verifiedRunOutcome?.status === 'created' || data.verifiedRunOutcome?.status === 'reused' ? 'success' : 'neutral'" variant="subtle" :title="verifiedRunOutcome.title" :description="verifiedRunOutcome.description || undefined" />
            <div class="overview-actions">
              <UButton v-if="data.resubmissionRequired" to="/me/submissions/new" label="重新提交截图" icon="i-lucide-upload" color="primary" size="lg" :disabled="mutationBusy" block />
              <UButton
                v-if="manualReviewEligible && !manualReviewRequested"
                label="申请人工核对"
                icon="i-lucide-user-check"
                color="neutral"
                variant="outline"
                :loading="requestingManualReview"
                :disabled="requestingManualReview || mutationBusy"
                aria-label="申请人工核对"
                block
                @click="handleRequestManualReview"
              />
              <UButton
                label="刷新状态"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                aria-label="刷新状态"
                :loading="refreshingStatus || fetchStatus === 'pending'"
                :disabled="refreshingStatus || fetchStatus === 'pending' || requestingManualReview"
                block
                @click="refreshSubmission"
              />
            </div>
          </section>

          <section v-if="data.ocr" class="panel" aria-labelledby="ocr-title">
            <h2 id="ocr-title" class="panel__title"><UIcon name="i-lucide-scan-line" aria-hidden="true" />识别摘要</h2>
            <dl class="detail-grid">
              <div class="detail-grid__row"><dt>地图</dt><dd>{{ ocrValue(data.ocr.mapName) }}</dd></div>
              <div class="detail-grid__row"><dt>难度</dt><dd>{{ ocrValue(data.ocr.difficulty) }}</dd></div>
              <div class="detail-grid__row"><dt>玩家</dt><dd>{{ ocrValue(data.ocr.playerName) }}</dd></div>
              <div class="detail-grid__row"><dt>通关标记</dt><dd>{{ ocrValue(data.ocr.challengeCompleted) }}</dd></div>
              <div v-if="data.ocr.achievementTitles?.length" class="detail-grid__row"><dt>识别到的成就</dt><dd>{{ data.ocr.achievementTitles.join('、') }}</dd></div>
              <div v-if="data.ocr.modelVersion" class="detail-grid__row"><dt>识别模型</dt><dd class="mono">{{ data.ocr.modelVersion }}</dd></div>
            </dl>
          </section>

          <OcrFeedbackPanel v-if="data.feedback" :submission-id="data.submissionId" :feedback="data.feedback" @recorded="refreshSubmission" @stale="refreshSubmission" />
        </div>
      </section>

      <section v-if="data.resubmissionRequired" class="panel" aria-labelledby="resubmission-title">
        <h2 id="resubmission-title" class="panel__title">重新提交建议</h2>
        <div class="resubmission-grid">
          <div v-for="item in resubmissionTips" :key="item.title" class="resubmission-tip">
            <span class="tip-icon"><UIcon :name="item.icon" aria-hidden="true" /></span>
            <div><strong>{{ item.title }}</strong><p>{{ item.description }}</p></div>
          </div>
        </div>
      </section>
    </template>

    <div v-else class="submission-skeleton" role="status" aria-label="读取中…">
      <USkeleton class="submission-skeleton__bar" />
      <div class="submission-layout" aria-hidden="true">
        <USkeleton class="submission-skeleton__evidence" />
        <USkeleton class="submission-skeleton__panel" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.submission-page { display: grid; gap: var(--space-5); padding-block: var(--space-8) 4.5rem; }
.sub-hero { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4) var(--space-8); padding-bottom: var(--space-5); border-bottom: 1px solid var(--line); }
.sub-hero__copy { display: grid; gap: var(--space-2); min-width: 0; }
.sub-hero__copy .eyebrow { margin: 0; }
.sub-hero__title { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4); margin: 0; font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3.25rem); font-weight: 700; letter-spacing: -.02em; line-height: 1.05; }
.sub-hero__title small { padding: 0 var(--space-3); border: 1px solid color-mix(in oklch, var(--accent) 50%, var(--line)); border-radius: var(--radius-control); color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; letter-spacing: 0; line-height: 1.9; }
.sub-hero__meta { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); margin: 0; color: var(--quiet); font-size: var(--type-caption-size); }
.sub-hero__status { transform: scale(1.15); transform-origin: right bottom; }
.status-live { display: grid; gap: var(--space-2); }
.submission-layout { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: var(--space-5); }
.evidence-col, .info-col { min-width: 0; }
.info-col { display: grid; gap: var(--space-4); }
/* Viewer frame: corner brackets around the screenshot. */
.evidence-frame { position: relative; padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-card); background: color-mix(in oklch, var(--page) 70%, black); }
.evidence-frame::before, .evidence-frame::after { position: absolute; width: 1.25rem; height: 1.25rem; border: 2px solid var(--accent); content: ""; pointer-events: none; }
.evidence-frame::before { top: -1px; left: -1px; border-right: 0; border-bottom: 0; border-top-left-radius: var(--radius-card); }
.evidence-frame::after { right: -1px; bottom: -1px; border-top: 0; border-left: 0; border-bottom-right-radius: var(--radius-card); }
.evidence-image { display: block; width: 100%; height: auto; border-radius: var(--radius-control); }
.evidence-message, .message { display: flex; align-items: center; justify-content: center; gap: var(--space-2); margin: 0; padding: var(--space-16) 0; color: var(--muted); font-size: var(--type-body-sm-size); text-align: center; }
.panel { display: grid; gap: var(--space-4); min-width: 0; padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.panel__title { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-family: var(--font-display); font-size: 1.0625rem; font-weight: 700; }
.panel__title svg { color: var(--accent); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--type-caption-size); overflow-wrap: anywhere; }
.overview-actions { display: grid; gap: var(--space-2); }
.resubmission-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
.resubmission-tip { display: grid; grid-template-columns: 2.25rem minmax(0, 1fr); align-items: start; gap: var(--space-3); }
.tip-icon { display: grid; width: 2.25rem; height: 2.25rem; place-items: center; border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--line)); border-radius: var(--radius-control); color: var(--accent); background: var(--accent-surface); }
.resubmission-tip strong { display: block; font-size: var(--type-label-sm-size); }
.resubmission-tip p { margin: var(--space-1) 0 0; color: var(--muted); font-size: var(--type-caption-size); line-height: 1.5; }
.submission-skeleton { display: grid; gap: var(--space-5); }
.submission-skeleton__bar { height: 7rem; border-radius: var(--radius-card); }
.submission-skeleton__evidence { aspect-ratio: 16 / 9; border-radius: var(--radius-card); }
.submission-skeleton__panel { height: 16rem; border-radius: var(--radius-card); }
@media (min-width: 64rem) {
  .submission-layout { grid-template-columns: minmax(0, 1.7fr) minmax(18rem, .9fr); }
  .evidence-col { position: sticky; top: var(--sticky-chrome-top); }
}
@media (max-width: 63.99rem) { .resubmission-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 47.99rem) {
  .submission-page { padding-block: var(--space-5) var(--space-12); }
  .sub-hero__status { transform: none; }
  .panel { padding: var(--space-4); }
  .overview-actions :deep(button) { min-height: 2.75rem; }
}
@media (prefers-contrast: more) { .panel, .evidence-frame { border-color: var(--text); } }
</style>
