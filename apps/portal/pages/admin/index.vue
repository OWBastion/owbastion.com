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
const processingTotal = ref(0);
const activePlayerTotal = ref(0);
const mapTotal = ref(0);
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const metrics = computed(() => {
  const value = (count: number) => loading.value ? "读取中…" : `${count}`;
  return [
    { label: "待审核", value: value(reviewTotal.value), detail: "人工审核队列", to: "/admin/reviews", tone: "accent" as const },
    { label: "OCR 队列", value: value(processingTotal.value), detail: "识别处理中", to: "/admin/reviews", tone: "accent" as const },
    { label: "活跃玩家", value: value(activePlayerTotal.value), detail: "账号状态正常", to: "/admin/players", tone: "quiet" as const },
    { label: "地图目录", value: value(mapTotal.value), detail: "已登记地图", to: "/admin/maps", tone: "quiet" as const },
  ];
});
const reviewQueue = computed(() => submissions.value.map((submission) => ({
  submissionId: submission.submissionId,
  mapName: submission.mapName,
  difficulty: submission.difficulty,
  playerName: submission.playerName,
  status: submissionStatusText[submission.status] ?? submission.status,
  updatedAt: formatTime(submission.updatedAt),
})));

onMounted(async () => {
  try {
    const [reviewResponse, processingResponse, playerResponse, mapResponse] = await Promise.all([
      api<{ items: AdminSubmission[]; total: number }>("/v1/submissions?status=received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required&page=1&pageSize=5"),
	      api<{ total: number }>("/v1/submissions?status=upload_pending,ocr_pending&page=1&pageSize=1"),
	      api<{ total: number }>("/v1/player-accounts?status=active&page=1&pageSize=1"),
	      api<{ items: Array<{ mapId: string }> }>("/v1/maps"),
	    ]);
    submissions.value = reviewResponse.items;
	    reviewTotal.value = reviewResponse.total;
	    processingTotal.value = processingResponse.total;
	    activePlayerTotal.value = playerResponse.total;
	    mapTotal.value = mapResponse.items.length;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取管理概览，请确认当前账号有管理员权限。").description;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AdminWorkspace title="管理概览">
    <template #messages><p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p></template>
    <AdminDashboardMetrics :metrics="metrics" />
    <AdminReviewQueue class="dashboard-queue" :loading="loading" :reviews="reviewQueue" />
    <AdminManagementLinks class="dashboard-tools" />
  </AdminWorkspace>
</template>

<style scoped>
.dashboard-tools { margin-top:clamp(12px,2vw,24px); }
</style>
