<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";
import type { AdminSubmission } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "审核管理 · 躲避堡垒 3" });
const api = useAdminApi();
const submissions = ref<AdminSubmission[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const page = ref(1);
const total = ref(0);
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const visibleStatuses = "received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required,approved,rejected,resubmission_required";
const statusTone = (status: string) => status === "ready_for_review" ? "success" : status === "ocr_review_required" ? "warning" : "default";
const submissionTarget = (submission: AdminSubmission) => submission.challenge?.family === "achievement" ? submission.challenge.titleName : `${submission.mapName}${submission.difficulty ? ` · ${submission.difficulty}` : ""}`;
const ocrStatusText: Record<AdminSubmission["ocrStatus"], string> = { not_started: "未开始", pending: "识别中", matched: "已匹配", mismatch: "未匹配", review_required: "需人工核对", error: "识别失败" };
const ocrStatusTone = (status: AdminSubmission["ocrStatus"]) => status === "matched" ? "success" : status === "mismatch" || status === "review_required" || status === "error" ? "warning" : "default";
const columns = [
  { accessorKey: "challenge", header: "挑战" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "ocrStatus", header: "OCRKit" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "", enableHiding: false },
];
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    const response = await api<{ items: AdminSubmission[]; total: number }>(`/v1/submissions?status=${visibleStatuses}&page=${page.value}&pageSize=20`);
    submissions.value = response.items;
    total.value = response.total;
    if (page.value > 1 && !submissions.value.length && total.value) {
      page.value--;
      await load();
    }
  }
  catch (error) { errorMessage.value = portalErrorDetails(error, "无法读取待核对截图，请确认当前账号有管理员权限。").description; }
  finally { loading.value = false; }
}
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="审核管理" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="提交记录"><AdminDataTable :data="submissions" :columns="columns" :loading="loading" empty="暂无提交记录。" table-key="reviews" :reset-scroll-key="page" class="admin-table">
      <template #challenge-cell="{ row }"><strong>{{ submissionTarget(row.original) }}</strong><small v-if="row.original.challenge?.family === 'achievement'" class="table-meta">{{ row.original.challenge.condition }}</small></template>
      <template #playerName-cell="{ row }"><span>{{ row.original.playerName }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="formatStatus(row.original.status)" :tone="statusTone(row.original.status)" /></template>
      <template #ocrStatus-cell="{ row }"><StatusBadge :label="ocrStatusText[row.original.ocrStatus]" :tone="ocrStatusTone(row.original.ocrStatus)" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><div class="table-actions"><UButton :to="`/admin/reviews/${encodeURIComponent(row.original.submissionId)}`" label="查看" size="sm" color="neutral" variant="outline" /></div></template>
    </AdminDataTable><UPagination v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" /></section>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { display:block; color:var(--quiet); font-size:.78rem; }.pagination { display:flex; justify-content:center; margin-top:16px; }
</style>
