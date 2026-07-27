<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
const route = useRoute();
const api = useAdminApi();
const toast = useToast();
const submission = shallowRef<AdminSubmission | null>(null);
const loading = ref(true);
const actionLoading = ref(false);
const errorMessage = ref("");
const reviewError = ref("");
const evidenceImageUrl = ref<string | null>(null);
const evidenceError = ref(false);
const submissionId = computed(() => String(route.params.submissionId));
const pageTitle = computed(() => submission.value?.mapName ? `审核：${submission.value.mapName}` : "审核详情");
const evidenceSrc = computed(() => evidenceImageUrl.value ?? `/api/admin/evidence/${encodeURIComponent(submissionId.value)}`);
const evidenceCdnHeader = { "x-owbastion-review": "portal-admin" };

async function load() {
  loading.value = true;
  errorMessage.value = "";
  evidenceError.value = false;
  clearEvidenceImage();
  try {
    const detail = await api<AdminSubmission>(`/v1/submissions/${encodeURIComponent(submissionId.value)}`);
    submission.value = detail;
    const source = detail.evidenceUrl;
    if (!source || !source.startsWith("https://evidence.owbastion.codes/")) return;
    const response = await fetch(source, { headers: evidenceCdnHeader, credentials: "omit" });
    if (!response.ok) throw new Error(`EVIDENCE_CDN_${response.status}`);
    evidenceImageUrl.value = URL.createObjectURL(await response.blob());
  } catch (error) {
    if (submission.value) evidenceError.value = true;
    else errorMessage.value = portalErrorDetails(error, "无法读取审核详情，请稍后重试。").description;
  } finally { loading.value = false; }
}

async function review(decision: "approved" | "rejected" | "resubmission_required") {
  if (!submission.value || actionLoading.value) return;
  actionLoading.value = true;
  reviewError.value = "";
  try {
    const result = await api<{ decision: typeof decision; titleName?: string; alreadyOwned?: boolean }>(`/v1/submissions/${encodeURIComponent(submission.value.submissionId)}/review`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", decision } });
    toast.add({ title: decision === "approved" ? result.alreadyOwned ? `审核通过；玩家此前已拥有「${result.titleName ?? "称号"}」，未重复发放` : `审核通过，已发放「${result.titleName ?? "称号"}」` : decision === "rejected" ? "审核已拒绝" : "已要求重新提交", color: "success" });
    await navigateTo("/admin/reviews");
  } catch (error) {
    const details = portalErrorDetails(error, "审核提交失败，请查看服务端日志。");
    reviewError.value = details.code === "CHALLENGE_REWARD_NOT_CONFIGURED" ? "该挑战尚未配置可发放的称号，无法审核通过。" : details.code ? `审核提交失败（${details.code}）：${details.description}` : details.description;
  } finally { actionLoading.value = false; }
}

function clearEvidenceImage() {
  if (evidenceImageUrl.value?.startsWith("blob:")) URL.revokeObjectURL(evidenceImageUrl.value);
  evidenceImageUrl.value = null;
}

onMounted(() => { void load(); });
onBeforeUnmount(clearEvidenceImage);
useSeoMeta({ title: () => `${pageTitle.value} · 躲避堡垒 3` });
</script>

<template>
  <AdminWorkspace :title="pageTitle">
    <template #actions><UButton to="/admin/reviews" label="返回审核管理" icon="i-lucide-arrow-left" color="neutral" variant="ghost" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><USkeleton v-else-if="loading" class="detail-loading" /></template>
    <AdminSubmissionReviewDetail v-if="submission" :submission="submission" :evidence-src="evidenceSrc" :evidence-error="evidenceError" :review-error="reviewError" :action-loading="actionLoading" @review="review" @evidence-error="evidenceError = true" />
    <UEmpty v-else-if="!loading" title="找不到该提交" description="提交记录可能已不存在或链接无效。" />
  </AdminWorkspace>
</template>

<style scoped>
.detail-loading { width:100%; height:120px; }.review-detail { width:100%; }
</style>
