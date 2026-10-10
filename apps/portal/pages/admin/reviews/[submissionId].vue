<script setup lang="ts">
import { watchDebounced } from "@vueuse/core";
import type { AdminSubmission, AdminSubmissionReviewInput, AdminSubmissionReviewPreview, AdminOcrAccuracyResponse, OcrAccuracyMark } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import { knownReviewBlockingMessage, reviewBlockingMessage } from "~/utils/submissionReview";
import { defaultReviewQueueOrder, reviewQueueStatuses } from "~/utils/reviewQueue";

// Each submission gets a fresh page, so moving on to the next one starts from clean review state instead of reusing the previous one.
definePageMeta({ middleware: ["auth", "admin-client"], key: (route) => route.fullPath });
const route = useRoute();
const api = useAdminApi();
const toast = useToast();
const submission = shallowRef<AdminSubmission | null>(null);
const actionLoading = ref(false);
const ocrRetryLoading = ref(false);
const ocrAccuracyLoading = ref(false);
const errorMessage = ref("");
const reviewError = ref("");
const ocrRetryError = ref("");
const ocrAccuracyError = ref("");
const spotCheckError = ref("");
const evidenceError = ref(false);
const refreshError = ref("");
const queuePath = useAdminReviewQueuePath();
const submissionId = computed(() => String(route.params.submissionId));
const reviewInput = shallowRef<AdminSubmissionReviewInput>({ fieldCorrections: [], confirmedChallengeIds: [] });
const reviewInputKey = computed(() => JSON.stringify(reviewInput.value));
const preview = shallowRef<AdminSubmissionReviewPreview | null>(null);
const previewKey = ref<string | null>(null);
const previewLoading = ref(false);
const previewError = ref("");
let previewSequence = 0;
/** Single page title: challenge target only (detail body no longer repeats an h2). */
const pageTitle = computed(() => {
  const detail = submission.value;
  if (!detail) return "审核详情";
  if (detail.challenge?.family === "achievement") return detail.challenge.titleName;
  return detail.difficulty ? `${detail.mapName} · ${detail.difficulty}` : detail.mapName;
});
const evidenceSrc = computed(() => submission.value?.evidenceUrl ?? null);

const adminData = useAdminAsyncData("submission-review-detail", () => api<AdminSubmission>(`/v1/submissions/${encodeURIComponent(submissionId.value)}`), {
  cacheKey: submissionId,
  onStart: () => { errorMessage.value = ""; refreshError.value = ""; },
  onData: (response) => {
    if (response.evidenceUrl !== submission.value?.evidenceUrl) evidenceError.value = false;
    submission.value = response;
    void loadPreview();
  },
  onError: (error) => {
    if (submission.value) refreshError.value = portalErrorDetails(error, "无法刷新审核详情，当前显示的是上次读取的内容。").description;
    else errorMessage.value = portalErrorDetails(error, "无法读取审核详情，请稍后重试。").description;
  },
});
const loading = adminData.loading;
async function load() { errorMessage.value = ""; refreshError.value = ""; evidenceError.value = false; await adminData.refresh(); }

const ocrPending = computed(() => submission.value?.status === "ocr_pending");
const ocrPollIntervalMs = 3000;
const ocrPollLimitMs = 120_000;
let ocrPollTimer: ReturnType<typeof setInterval> | null = null;
function stopOcrPoll() {
  if (ocrPollTimer) clearInterval(ocrPollTimer);
  ocrPollTimer = null;
}
watch(ocrPending, (pending) => {
  stopOcrPoll();
  if (!pending || !import.meta.client) return;
  const startedAt = Date.now();
  ocrPollTimer = setInterval(() => {
    if (Date.now() - startedAt > ocrPollLimitMs) {
      stopOcrPoll();
      refreshError.value = "识别时间较长，请稍后刷新页面查看结果。";
      return;
    }
    if (document.visibilityState === "hidden" || adminData.pending.value || actionLoading.value) return;
    void adminData.refresh();
  }, ocrPollIntervalMs);
}, { immediate: true });
onBeforeUnmount(stopOcrPoll);

async function loadPreview() {
  const { fieldCorrections, confirmedChallengeIds } = reviewInput.value;
  // Without a recognition result only the reviewer's field corrections can produce evidence.
  if (!submission.value || (!submission.value.ocr && !fieldCorrections.length)) {
    previewSequence++;
    preview.value = null;
    previewKey.value = reviewInputKey.value;
    previewLoading.value = false;
    previewError.value = "";
    return;
  }
  const sequence = ++previewSequence;
  const key = reviewInputKey.value;
  previewLoading.value = true;
  previewError.value = "";
  try {
    const result = await api<AdminSubmissionReviewPreview>(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/review/preview`, { method: "POST", body: { contractVersion: "1", ...(fieldCorrections.length ? { fieldCorrections } : {}), ...(confirmedChallengeIds.length ? { confirmedChallengeIds } : {}) } });
    if (sequence !== previewSequence) return;
    preview.value = result;
    previewKey.value = key;
  } catch (error) {
    if (sequence !== previewSequence) return;
    const details = portalErrorDetails(error, "无法计算通过后的结果，请稍后重试。");
    previewError.value = details.code ? reviewBlockingMessage(details.code) : details.description;
    previewKey.value = null;
  } finally {
    if (sequence === previewSequence) previewLoading.value = false;
  }
}

watchDebounced(reviewInputKey, () => { void loadPreview(); }, { debounce: 300 });

function updateReviewInput(value: AdminSubmissionReviewInput) {
  reviewInput.value = value;
}

/** Next submission of the default queue, so a maintainer can keep reviewing without returning to the list. Filtered queue views go back to that list instead. */
async function nextReviewPath(currentSubmissionId: string) {
  const order = defaultReviewQueueOrder(queuePath.value);
  if (!order) return null;
  try {
    const { items } = await api<{ items: AdminSubmission[] }>(`/v1/submissions?page=1&pageSize=2&status=${reviewQueueStatuses}&order=${order}`);
    const next = items.find((item) => item.submissionId !== currentSubmissionId);
    return next ? `/admin/reviews/${encodeURIComponent(next.submissionId)}` : null;
  } catch {
    return null;
  }
}

async function review(decision: "approved" | "rejected" | "resubmission_required", reason?: string) {
  if (!submission.value || actionLoading.value) return;
  if (decision === "approved" && previewKey.value !== reviewInputKey.value) return;
  const { fieldCorrections, confirmedChallengeIds } = reviewInput.value;
  actionLoading.value = true;
  reviewError.value = "";
  try {
    const result = await api<{ decision: typeof decision; titleName?: string; alreadyOwned?: boolean; grants?: Array<{ titleName: string; alreadyOwned: boolean }> }>(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/review`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", decision, ...(reason ? { reason } : {}), ...(fieldCorrections.length ? { fieldCorrections } : {}), ...(decision === "approved" && confirmedChallengeIds.length ? { confirmedChallengeIds } : {}) } });
    const grants = result.grants ?? (result.titleName ? [{ titleName: result.titleName, alreadyOwned: Boolean(result.alreadyOwned) }] : []);
    toast.add({ title: decision === "approved" ? grants.length > 1 ? `审核通过，已处理 ${grants.length} 个称号` : grants[0]?.alreadyOwned ? `审核通过；玩家此前已拥有「${grants[0].titleName}」，未重复获得` : `审核通过，玩家已获得「${grants[0]?.titleName ?? "称号"}」` : decision === "rejected" ? "审核已拒绝" : "已要求重新提交", color: "success" });
    await navigateTo(await nextReviewPath(submissionId.value) ?? queuePath.value);
  } catch (error) {
    const details = portalErrorDetails(error, "审核提交失败，请查看服务端日志。");
    reviewError.value = knownReviewBlockingMessage(details.code) ?? (details.code ? `审核提交失败（${details.code}）：${details.description}` : details.description);
    if (decision === "approved") void loadPreview();
  } finally { actionLoading.value = false; }
}

async function resolveSpotCheck(decision: "confirmed" | "revoked", reason?: string) {
  if (!submission.value || actionLoading.value) return;
  actionLoading.value = true;
  spotCheckError.value = "";
  try {
    await api(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/spot-check`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", decision, ...(reason ? { reason } : {}) } });
    toast.add({ title: decision === "confirmed" ? "抽检已确认" : "已撤销自动获得的称号", color: "success" });
    await load();
  } catch (error) {
    const details = portalErrorDetails(error, "抽检处理失败，请稍后重试。");
    spotCheckError.value = details.code ? `抽检处理失败（${details.code}）：${details.description}` : details.description;
  } finally { actionLoading.value = false; }
}

async function reopenSubmission(reason?: string) {
  if (!submission.value || actionLoading.value) return;
  actionLoading.value = true;
  spotCheckError.value = "";
  try {
    const result = await api<{ revokedGrantCount: number }>(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/reopen`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", ...(reason ? { reason } : {}) } });
    toast.add({ title: `已重新打开核对，撤销 ${result.revokedGrantCount} 个称号`, color: "success" });
    await load();
  } catch (error) {
    const details = portalErrorDetails(error, "重新打开失败，请稍后重试。");
    spotCheckError.value = details.code ? `重新打开失败（${details.code}）：${details.description}` : details.description;
  } finally { actionLoading.value = false; }
}

async function retryOcr() {
  if (!submission.value || actionLoading.value || ocrRetryLoading.value) return;
  ocrRetryLoading.value = true;
  ocrRetryError.value = "";
  try {
    await api(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/ocr/retry`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
    toast.add({ title: "已重新发送 OCRKit 识别请求", color: "success" });
    await load();
  } catch (error) {
    const details = portalErrorDetails(error, "OCRKit 请求发送失败，请稍后重试。");
    ocrRetryError.value = details.code ? `OCRKit 请求失败（${details.code}）：${details.description}` : details.description;
  } finally { ocrRetryLoading.value = false; }
}

async function markOcrAccuracy(accuracy: OcrAccuracyMark) {
  const detail = submission.value;
  if (!detail?.ocrResultId || actionLoading.value || ocrAccuracyLoading.value) return;
  ocrAccuracyLoading.value = true;
  ocrAccuracyError.value = "";
  try {
    await api<AdminOcrAccuracyResponse>(`/v1/submissions/${encodeURIComponent(detail.submissionId)}/ocr-accuracy`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", ocrResultId: detail.ocrResultId, accuracy } });
    await load();
  } catch (error) {
    const details = portalErrorDetails(error, "标记失败，请稍后重试。");
    ocrAccuracyError.value = details.code ? `标记失败（${details.code}）：${details.description}` : details.description;
  } finally { ocrAccuracyLoading.value = false; }
}

useSeoMeta({ title: () => `${pageTitle.value} · 躲避堡垒 3` });
</script>

<template>
  <AdminWorkspace :title="pageTitle">
    <template #actions><UButton :to="queuePath" label="返回队列" icon="i-lucide-arrow-left" color="neutral" variant="ghost" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><USkeleton v-else-if="loading" class="detail-loading" /><UAlert v-if="refreshError" color="warning" variant="subtle" :description="refreshError" role="status" /></template>
    <AdminSubmissionReviewDetail v-if="submission" :submission="submission" :evidence-src="evidenceSrc" :evidence-error="evidenceError" :review-error="reviewError || spotCheckError" :action-loading="actionLoading" :ocr-retry-error="ocrRetryError" :ocr-retry-loading="ocrRetryLoading" :ocr-accuracy-error="ocrAccuracyError" :ocr-accuracy-loading="ocrAccuracyLoading" :preview="preview" :preview-loading="previewLoading" :preview-error="previewError" :preview-current="previewKey === reviewInputKey" @review="review" @review-input="updateReviewInput" @retry-preview="loadPreview" @spot-check="resolveSpotCheck" @reopen="reopenSubmission" @retry-ocr="retryOcr" @ocr-accuracy="markOcrAccuracy" @evidence-error="evidenceError = true" />
    <UEmpty v-else-if="!loading" title="找不到该提交" />
  </AdminWorkspace>
</template>

<style scoped>
.detail-loading { width:100%; height:120px; }.review-detail { width:100%; }
</style>
