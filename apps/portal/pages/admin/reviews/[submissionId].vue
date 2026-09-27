<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
const route = useRoute();
const api = useAdminApi();
const toast = useToast();
const submission = shallowRef<AdminSubmission | null>(null);
const actionLoading = ref(false);
const ocrRetryLoading = ref(false);
const errorMessage = ref("");
const reviewError = ref("");
const ocrRetryError = ref("");
const spotCheckError = ref("");
const annotationOpen = shallowRef(false);
const evidenceError = ref(false);
const submissionId = computed(() => String(route.params.submissionId));
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
  onStart: () => { errorMessage.value = ""; evidenceError.value = false; },
  onData: (response) => { submission.value = response; },
  onError: (error) => {
    if (submission.value) evidenceError.value = true;
    else errorMessage.value = portalErrorDetails(error, "无法读取审核详情，请稍后重试。").description;
  },
});
const loading = adminData.loading;
async function load() { errorMessage.value = ""; evidenceError.value = false; await adminData.refresh(); }

async function review(decision: "approved" | "rejected" | "resubmission_required", fieldCorrections?: Array<{ fieldKey: string; reviewedValue: string }>) {
  if (!submission.value || actionLoading.value) return;
  actionLoading.value = true;
  reviewError.value = "";
  try {
    const result = await api<{ decision: typeof decision; titleName?: string; alreadyOwned?: boolean; grants?: Array<{ titleName: string; alreadyOwned: boolean }> }>(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/review`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", decision, ...(fieldCorrections?.length ? { fieldCorrections } : {}) } });
    const grants = result.grants ?? (result.titleName ? [{ titleName: result.titleName, alreadyOwned: Boolean(result.alreadyOwned) }] : []);
    toast.add({ title: decision === "approved" ? grants.length > 1 ? `审核通过，已处理 ${grants.length} 个称号` : grants[0]?.alreadyOwned ? `审核通过；玩家此前已拥有「${grants[0].titleName}」，未重复获得` : `审核通过，玩家已获得「${grants[0]?.titleName ?? "称号"}」` : decision === "rejected" ? "审核已拒绝" : "已要求重新提交", color: "success" });
    await navigateTo("/admin/reviews");
  } catch (error) {
    const details = portalErrorDetails(error, "审核提交失败，请查看服务端日志。");
    reviewError.value = details.code === "CHALLENGE_REWARD_NOT_CONFIGURED" ? "该挑战尚未配置可发放的称号，无法审核通过。" : details.code ? `审核提交失败（${details.code}）：${details.description}` : details.description;
  } finally { actionLoading.value = false; }
}

async function resolveSpotCheck(decision: "confirmed" | "revoked") {
  if (!submission.value || actionLoading.value) return;
  actionLoading.value = true;
  spotCheckError.value = "";
  try {
    await api(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/spot-check`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", decision } });
    toast.add({ title: decision === "confirmed" ? "抽检已确认" : "已撤销自动获得的称号", color: "success" });
    await load();
  } catch (error) {
    const details = portalErrorDetails(error, "抽检处理失败，请稍后重试。");
    spotCheckError.value = details.code ? `抽检处理失败（${details.code}）：${details.description}` : details.description;
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

useSeoMeta({ title: () => `${pageTitle.value} · 躲避堡垒 3` });
</script>

<template>
  <AdminWorkspace :title="pageTitle">
    <template #actions><UButton to="/admin/reviews" label="返回队列" icon="i-lucide-arrow-left" color="neutral" variant="ghost" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><USkeleton v-else-if="loading" class="detail-loading" /></template>
    <AdminSubmissionReviewDetail v-if="submission" :submission="submission" :evidence-src="evidenceSrc" :evidence-error="evidenceError" :review-error="reviewError || spotCheckError" :action-loading="actionLoading" :ocr-retry-error="ocrRetryError" :ocr-retry-loading="ocrRetryLoading" @review="review" @spot-check="resolveSpotCheck" @retry-ocr="retryOcr" @open-direct-annotation="annotationOpen = true" @evidence-error="evidenceError = true" />
    <UEmpty v-else-if="!loading" title="找不到该提交" />
    <AdminAnnotationDirectDialog v-model:open="annotationOpen" :initial-submission-id="submissionId" @created="toast.add({ title: '已创建审定标注', color: 'success' })" />
  </AdminWorkspace>
</template>

<style scoped>
.detail-loading { width:100%; height:120px; }.review-detail { width:100%; }
</style>
