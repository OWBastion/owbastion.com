<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { submissionStatusText } from "~/utils/submissionStatus";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "管理后台 · 躲避堡垒 3" });

const api = useAdminApi();
const submissions = ref<AdminSubmission[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const reviewTotal = ref(0);
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const queueMapName = (submission: AdminSubmission) => {
  const mapName = (submission.ocr as { data?: { map_name?: unknown } } | null)?.data?.map_name;
  return typeof mapName === "string" && mapName.trim() ? mapName : submission.mapName;
};
const reviewQueue = computed(() => submissions.value.map((submission) => ({
  submissionId: submission.submissionId,
  mapName: queueMapName(submission),
  difficulty: submission.difficulty,
  playerName: submission.playerName,
  status: submissionStatusText[submission.status] ?? submission.status,
  updatedAt: formatTime(submission.updatedAt),
})));

onMounted(async () => {
  try {
    const reviewResponse = await api<{ items: AdminSubmission[]; total: number }>("/v1/submissions?status=received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required&page=1&pageSize=5");
    submissions.value = reviewResponse.items;
    reviewTotal.value = reviewResponse.total;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取管理概览，请确认当前账号有管理员权限。").description;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AdminWorkspace title="管理概览" :count="loading ? '读取中…' : `${reviewTotal} 条待核对`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <AdminReviewQueue class="dashboard-queue" :loading="loading" :reviews="reviewQueue" />
  </AdminWorkspace>
</template>
