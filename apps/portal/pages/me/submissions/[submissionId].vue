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
const pollTimedOut = shallowRef(false);
let ocrPollTimer: ReturnType<typeof setTimeout> | null = null;
const evidenceState = shallowRef<"loading" | "ready" | "missing" | "failed">("loading");
const ocrValue = (value: string | boolean | null) => value === null ? "未识别" : typeof value === "boolean" ? value ? "已识别完成" : "未识别完成" : value;
const manualReviewEligible = computed(() => data.value?.manualReviewEligible === true);
const verifiedRunOutcome = computed(() => verifiedRunOutcomePresentation(data.value?.verifiedRunOutcome));
const mutationBusy = computed(() => requestingManualReview.value || refreshingStatus.value);
// One short line under the status: why it was rejected, or what it earned.
const outcomeLine = computed(() => {
  if (!data.value) return "";
  if (data.value.status === "rejected") return data.value.reason ?? "";
  if (data.value.titleGrant) return `获得「${data.value.titleGrant.titleName}」`;
  return verifiedRunOutcome.value?.inline ?? "";
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
    actionMessage.value = "已申请";
    await refresh();
  } catch (cause) {
    manualReviewError.value = portalErrorDetails(cause, "申请失败，请稍后重试。").description;
  } finally {
    requestingManualReview.value = false;
  }
};

const refreshSubmission = async () => {
  if (refreshingStatus.value || fetchStatus.value === "pending") return;
  refreshingStatus.value = true;
  refreshError.value = "";
  pollTimedOut.value = false;
  actionMessage.value = "";
  try {
    // Explicit refresh keeps the current detail on failure instead of replacing the page with the route error state.
    data.value = await api<PlayerSubmissionDetail>(`/v1/me/submissions/${encodeURIComponent(submissionId)}`);
  } catch (cause) {
    refreshError.value = portalErrorDetails(cause, "刷新失败，请稍后重试。").description;
  } finally {
    refreshingStatus.value = false;
  }
};

const markEvidenceFailed = () => {
  evidenceState.value = hasEvidenceSource.value ? "failed" : "missing";
};

const loadEvidence = () => { evidenceState.value = hasEvidenceSource.value ? "ready" : "missing"; };

const ocrProcessing = computed(() => data.value?.status === "processing");
const ocrPollInitialMs = 2000;
const ocrPollMaxIntervalMs = 16_000;
const ocrPollLimitMs = 120_000;
function stopOcrPoll() {
  if (ocrPollTimer) clearTimeout(ocrPollTimer);
  ocrPollTimer = null;
}
watch(ocrProcessing, (processing) => {
  stopOcrPoll();
  if (pollTimedOut.value) {
    pollTimedOut.value = false;
    refreshError.value = "";
  }
  if (!processing || !import.meta.client) return;
  const startedAt = Date.now();
  let delayMs = ocrPollInitialMs;
  async function poll() {
    ocrPollTimer = null;
    if (Date.now() - startedAt >= ocrPollLimitMs) {
      pollTimedOut.value = true;
      refreshError.value = "仍在处理中，请稍后点击「刷新状态」查看最新进度。";
      return;
    }
    if (document.visibilityState !== "hidden" && fetchStatus.value !== "pending" && !mutationBusy.value) {
      try { await refresh(); } catch { /* A failed tick keeps the backoff cadence. */ }
      if (!ocrProcessing.value) return;
    }
    delayMs = Math.min(delayMs * 2, ocrPollMaxIntervalMs);
    ocrPollTimer = setTimeout(poll, delayMs);
  }
  ocrPollTimer = setTimeout(poll, delayMs);
}, { immediate: true });
onMounted(() => { void loadEvidence(); });
onBeforeUnmount(stopOcrPoll);
</script>

<template>
  <main class="sub page-shell">
    <UButton to="/me" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="返回玩家中心" class="sub__back" />

    <p v-if="error && !data" class="sub__message" role="alert">找不到这条提交</p>
    <template v-else-if="data">
      <header class="sub__hero" :data-tone="playerSubmissionStatusTone(data.status, data.resubmissionRequired)">
        <p class="sub__map">{{ data.mapName }}<small v-if="data.difficulty">{{ data.difficulty }}</small></p>
        <h1 class="sub__status">{{ playerSubmissionStatusLabel(data.status, data.resubmissionRequired) }}</h1>
        <p v-if="outcomeLine" class="sub__outcome">{{ outcomeLine }}</p>
      </header>

      <SubmissionProgress :status="data.status" :resubmission-required="data.resubmissionRequired" />

      <UButton v-if="data.resubmissionRequired" to="/me/submissions/new" label="重新提交" icon="i-lucide-upload" size="xl" block />
      <UButton
        v-else-if="manualReviewEligible && !manualReviewRequested"
        label="申请人工核对"
        icon="i-lucide-user-check"
        size="xl"
        block
        :loading="requestingManualReview"
        :disabled="mutationBusy"
        @click="handleRequestManualReview"
      />
      <p v-if="pollTimedOut" class="sub__live">自动更新已停止 <UButton label="刷新" color="neutral" variant="link" size="sm" :loading="refreshingStatus" @click="refreshSubmission" /></p>
      <p v-else-if="manualReviewError || refreshError || actionMessage" class="sub__live" :class="{ 'is-error': manualReviewError || refreshError }" aria-live="polite">{{ manualReviewError || refreshError || actionMessage }}</p>

      <figure v-if="evidenceState !== 'missing'" class="sub__evidence">
        <img
          v-if="evidenceDisplaySrc && evidenceState !== 'failed'"
          :src="evidenceDisplaySrc"
          :alt="`${data.mapName}的提交截图`"
          @error="markEvidenceFailed"
        />
        <figcaption v-else class="sub__message"><UIcon name="i-lucide-image-off" aria-hidden="true" />{{ evidenceState === 'failed' ? '截图读取失败' : '读取中…' }}</figcaption>
      </figure>

      <OcrFeedbackPanel v-if="data.feedback" :submission-id="data.submissionId" :feedback="data.feedback" @recorded="refreshSubmission" @stale="refreshSubmission" />

      <details v-if="data.ocr" class="sub__details">
        <summary>识别结果</summary>
        <dl>
          <div><dt>地图</dt><dd>{{ ocrValue(data.ocr.mapName) }}</dd></div>
          <div><dt>难度</dt><dd>{{ ocrValue(data.ocr.difficulty) }}</dd></div>
          <div><dt>玩家</dt><dd>{{ ocrValue(data.ocr.playerName) }}</dd></div>
          <div><dt>通关</dt><dd>{{ ocrValue(data.ocr.challengeCompleted) }}</dd></div>
          <div v-if="data.ocr.achievementTitles?.length"><dt>成就</dt><dd>{{ data.ocr.achievementTitles.join('、') }}</dd></div>
          <div><dt>编号</dt><dd class="mono">{{ data.submissionId }}</dd></div>
        </dl>
      </details>
    </template>

    <div v-else class="sub__skeleton" role="status" aria-label="读取中…">
      <USkeleton class="h-24" />
      <USkeleton class="aspect-video" />
    </div>
  </main>
</template>

<style scoped>
.sub { display: grid; align-content: start; gap: var(--space-6); max-width: 44rem; padding-block: var(--space-8) 4.5rem; }
.sub__back { justify-self: start; margin-left: calc(-1 * var(--space-2)); }
.sub__hero { --tone: var(--quiet); display: grid; gap: var(--space-2); }
.sub__hero[data-tone="success"] { --tone: var(--success); }
.sub__hero[data-tone="info"] { --tone: var(--info); }
.sub__hero[data-tone="warning"] { --tone: var(--warning); }
.sub__hero[data-tone="error"] { --tone: var(--danger); }
.sub__map { display: flex; align-items: baseline; gap: var(--space-2); margin: 0; color: var(--muted); font-weight: 600; }
.sub__map small { color: var(--quiet); font-size: var(--type-caption-size); }
.sub__status { margin: 0; color: var(--tone); font-family: var(--font-display); font-size: clamp(2.25rem, 6vw, 3.5rem); font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.sub__outcome { margin: 0; color: var(--text); font-size: var(--type-body-sm-size); }
.sub__live { margin: 0; color: var(--accent); font-size: var(--type-label-sm-size); text-align: center; }
.sub__live.is-error { color: var(--danger); }
.sub__evidence { margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: color-mix(in oklch, var(--page) 70%, black); }
.sub__evidence img { display: block; width: 100%; height: auto; }
.sub__message { display: flex; align-items: center; justify-content: center; gap: var(--space-2); margin: 0; padding: var(--space-12) 0; color: var(--muted); font-size: var(--type-body-sm-size); }
.sub__details { border-top: 1px solid var(--line); padding-top: var(--space-4); }
.sub__details summary { color: var(--muted); font-size: var(--type-label-sm-size); cursor: pointer; }
.sub__details dl { display: grid; gap: var(--space-2); margin: var(--space-4) 0 0; }
.sub__details dl > div { display: grid; grid-template-columns: 4rem minmax(0, 1fr); gap: var(--space-3); font-size: var(--type-label-sm-size); }
.sub__details dt { color: var(--quiet); }
.sub__details dd { margin: 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--type-caption-size); overflow-wrap: anywhere; }
.sub__skeleton { display: grid; gap: var(--space-6); }
@media (max-width: 47.99rem) { .sub { padding-block: var(--space-5) var(--space-12); } }
</style>
