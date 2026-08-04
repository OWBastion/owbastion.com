<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";
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
type OcrField = { confidence?: unknown };
type OcrPayload = { data?: { map_name?: unknown; achievement_titles?: unknown }; fields?: Record<string, OcrField> };
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
type ReviewStatus = "all" | keyof typeof submissionStatusText;
const reviewStatus = shallowRef<ReviewStatus>("all");
const reviewStatusOptions = [{ label: "全部状态", value: "all" }, ...Object.entries(submissionStatusText).map(([value, label]) => ({ label, value }))];
const spotCheckFilter = shallowRef<"all" | "pending" | "confirmed" | "revoked">("all");
const spotCheckOptions = [{ label: "全部抽检", value: "all" }, { label: "待抽检", value: "pending" }, { label: "已确认", value: "confirmed" }, { label: "已撤销", value: "revoked" }];
const spotCheckLabel = (submission: AdminSubmission) => submission.spotCheck?.status === "pending" ? "待抽检" : submission.spotCheck?.status === "confirmed" ? "已确认" : submission.spotCheck?.status === "revoked" ? "已撤销" : "—";
const spotCheckTone = (submission: AdminSubmission) => submission.spotCheck?.status === "pending" ? "warning" : "default";
const ocrPayload = (submission: AdminSubmission) => submission.ocr as OcrPayload | null;
const ocrMapName = (submission: AdminSubmission) => {
  const mapName = ocrPayload(submission)?.data?.map_name;
  return typeof mapName === "string" && mapName.trim() ? mapName : "未识别地图";
};
const ocrAchievementTitles = (submission: AdminSubmission) => {
  const payload = ocrPayload(submission);
  if (!payload) return "未识别";
  const titles = payload.data?.achievement_titles;
  if (!Array.isArray(titles)) return "未识别";
  const names = titles.filter((title): title is string => typeof title === "string" && Boolean(title.trim()));
  return names.length ? names.join("、") : "无";
};
const ocrConfidence = (submission: AdminSubmission, field: string) => {
  const confidence = ocrPayload(submission)?.fields?.[field]?.confidence;
  return typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "—";
};
const defaultReviewSorting: SortingState = [{ id: "updatedAt", desc: true }];
const reviewSorting = shallowRef<SortingState>([...defaultReviewSorting]);
const reviewSortingOptions = [
  { id: "ocrContent", label: "OCR识别" },
  { id: "playerName", label: "玩家" },
  { id: "status", label: "状态" },
  { id: "ocrStatus", label: "OCRKit" },
  { id: "updatedAt", label: "最近更新" },
];
const columns: TableColumn<AdminSubmission>[] = [
  { accessorFn: (row) => ocrMapName(row), id: "ocrContent", header: "OCR识别" },
  { id: "ocrConfidence", header: "置信度" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "ocrStatus", header: "OCRKit" },
  { id: "spotCheck", header: "抽检" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "", enableHiding: false },
];
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    const statusQuery = reviewStatus.value === "all" ? "" : `&status=${encodeURIComponent(reviewStatus.value)}`;
    const spotCheckQuery = spotCheckFilter.value === "all" ? "" : `&spotCheck=${spotCheckFilter.value}`;
    const response = await api<{ items: AdminSubmission[]; total: number }>(`/v1/submissions?page=${page.value}&pageSize=20${statusQuery}${spotCheckQuery}`);
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
watch([reviewStatus, spotCheckFilter], () => { page.value = 1; void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="审核管理" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="提交记录"><AdminDataTable v-model:sorting="reviewSorting" :sorting-options="reviewSortingOptions" :default-sorting="defaultReviewSorting" :data="submissions" :columns="columns" :mobile-columns="[{ id: 'ocrContent', priority: 'primary', order: 0 }, { id: 'playerName', priority: 'primary', order: 1 }, { id: 'status', priority: 'primary', order: 2 }, { id: 'ocrConfidence', priority: 'detail', order: 3 }, { id: 'ocrStatus', priority: 'detail', order: 4 }, { id: 'spotCheck', priority: 'detail', order: 5 }, { id: 'updatedAt', priority: 'detail', order: 6 }]" row-key="submissionId" :mobile-row-link="(row) => `/admin/reviews/${encodeURIComponent(row.submissionId)}`" :loading="loading" empty="暂无提交记录。" table-key="reviews" :reset-scroll-key="page" class="admin-table">
      <template #filters><div class="review-filters"><USelect v-model="reviewStatus" aria-label="筛选提交状态" :items="reviewStatusOptions" /><USelect v-model="spotCheckFilter" aria-label="筛选抽检状态" :items="spotCheckOptions" /></div></template>
      <template #mobile-secondary><div class="review-filters"><USelect v-model="reviewStatus" aria-label="筛选提交状态" :items="reviewStatusOptions" /><USelect v-model="spotCheckFilter" aria-label="筛选抽检状态" :items="spotCheckOptions" /></div></template>
      <template #ocrContent-cell="{ row }"><strong>{{ ocrMapName(row.original) }}</strong><small class="table-meta">成就挑战：{{ ocrAchievementTitles(row.original) }}</small></template>
      <template #ocrConfidence-cell="{ row }"><span class="table-meta">地图 {{ ocrConfidence(row.original, "map_name") }}</span><span class="table-meta">成就 {{ ocrConfidence(row.original, "achievement_titles") }}</span></template>
      <template #playerName-cell="{ row }"><span>{{ row.original.playerName }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="formatStatus(row.original.status)" :tone="submissionStatusTone(row.original.status)" /></template>
      <template #ocrStatus-cell="{ row }"><StatusBadge :label="ocrStatusLabel(row.original.ocrStatus)" :tone="ocrStatusTone(row.original.ocrStatus)" /></template>
      <template #spotCheck-cell="{ row }"><StatusBadge v-if="row.original.spotCheck" :label="spotCheckLabel(row.original)" :tone="spotCheckTone(row.original)" /><span v-else class="table-meta">—</span></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><div class="table-actions"><UButton :to="`/admin/reviews/${encodeURIComponent(row.original.submissionId)}`" label="查看" size="sm" color="neutral" variant="outline" /></div></template>
    </AdminDataTable><UPagination v-if="total > 20" v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" /></section>
  </AdminWorkspace>
</template>

<style scoped>
.review-filters { display:flex; flex-wrap:wrap; gap:8px; }.table-meta { display:block; color:var(--quiet); font-size:.78rem; }.pagination { display:flex; justify-content:center; margin-top:10px; }
@media (max-width: 620px) { .review-filters { display:grid; grid-template-columns:1fr; width:100%; } }
</style>
