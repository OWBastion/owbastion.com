<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";
import type { AdminSubmission } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { reviewQueueStatuses } from "~/utils/reviewQueue";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "截图审核 · 躲避堡垒 3" });
const route = useRoute();
const router = useRouter();
const api = useAdminApi();
const submissions = ref<AdminSubmission[]>([]);
const errorMessage = ref("");
const queuePath = useAdminReviewQueuePath();
const total = ref(0);
type OcrField = { confidence?: unknown };
type OcrPayload = { data?: { map_name?: unknown; achievement_titles?: unknown }; fields?: Record<string, OcrField> };
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
type ReviewStatus = "queue" | "all" | keyof typeof submissionStatusText;
function parseReviewStatus(value: unknown): ReviewStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "all" || raw === "queue") return raw;
  if (typeof raw === "string" && raw in submissionStatusText) return raw as ReviewStatus;
  return "queue";
}
// Player-facing projections (processing / needs_review / completed) are not stored submission statuses.
const playerProjectionStatuses = new Set(["processing", "needs_review", "completed"]);
// The 待核对 queue already covers every state waiting for a maintainer, so those states (and the legacy awaiting_player_confirmation, which reads the same) are not offered again one by one.
const reviewStatusOptions = [{ label: "待核对", value: "queue" }, { label: "全部状态", value: "all" }, ...Object.entries(submissionStatusText).filter(([value]) => !playerProjectionStatuses.has(value) && !reviewQueueStatuses.split(",").includes(value) && value !== "awaiting_player_confirmation").map(([value, label]) => ({ label, value }))];
type SpotCheckFilter = "all" | "pending" | "confirmed" | "revoked";
function parseSpotCheck(value: unknown): SpotCheckFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "pending" || raw === "confirmed" || raw === "revoked" ? raw : "all";
}
function parsePage(value: unknown) {
  const raw = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(raw) && raw > 1 ? raw : 1;
}
type ReviewOrder = "oldest" | "newest";
function parseOrder(value: unknown): ReviewOrder | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "oldest" || raw === "newest" ? raw : null;
}
const page = ref(parsePage(route.query.page));
const orderOverride = shallowRef<ReviewOrder | null>(parseOrder(route.query.order));
const spotCheckFilter = shallowRef<SpotCheckFilter>(parseSpotCheck(route.query.spotCheck));
// Spot checks sample automatically approved submissions, which the default queue statuses never include.
const statusForSpotCheck = (status: ReviewStatus, spotCheck: SpotCheckFilter): ReviewStatus => spotCheck !== "all" && status === "queue" ? "all" : status;
const reviewStatus = shallowRef<ReviewStatus>(statusForSpotCheck(parseReviewStatus(route.query.status), spotCheckFilter.value));
// Items waiting for a decision are worked oldest first; browsing other statuses defaults to the latest activity.
const defaultOrder = computed<ReviewOrder>(() => reviewStatus.value === "queue" ? "oldest" : "newest");
const reviewOrder = computed<ReviewOrder>({
  get: () => orderOverride.value ?? defaultOrder.value,
  set: (value) => { orderOverride.value = value === defaultOrder.value ? null : value; },
});
const reviewOrderOptions = [{ label: "等待最久优先", value: "oldest" }, { label: "最新更新优先", value: "newest" }];
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
// The server order (reviewOrder) is the default; column sorting only reorders the current page.
const defaultReviewSorting: SortingState = [];
const reviewSorting = shallowRef<SortingState>([...defaultReviewSorting]);
const reviewSortingOptions = [
  { id: "ocrContent", label: "OCR识别" },
  { id: "playerName", label: "玩家" },
  { id: "status", label: "状态" },
  { id: "updatedAt", label: "最近更新" },
];
const columns: TableColumn<AdminSubmission>[] = [
  { accessorFn: (row) => ocrMapName(row), id: "ocrContent", header: "OCR识别" },
  { id: "ocrConfidence", header: "置信度" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { id: "spotCheck", header: "抽检" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "", enableHiding: false },
];
const toast = useToast();
const reevaluating = ref(false);
const reevaluable = computed(() => submissions.value.filter((item) => item.status === "ocr_review_required"));
// Re-runs the decision from each stored recognition so items held under older rules or data settle without opening them one by one.
async function reevaluatePage() {
  if (reevaluating.value || !reevaluable.value.length) return;
  reevaluating.value = true;
  const items = [...reevaluable.value];
  let failed = 0;
  let settled = 0;
  for (const item of items) {
    try {
      const result = await api<{ status: string }>(`/v1/submissions/${encodeURIComponent(item.submissionId)}/ocr/reevaluate`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
      if (result.status !== "ocr_review_required") settled += 1;
    } catch { failed += 1; }
  }
  reevaluating.value = false;
  toast.add({ title: `已重新评估 ${items.length} 条，${settled} 条状态已更新${failed ? `，${failed} 条失败` : ""}`, color: failed ? "warning" : "success" });
  await refresh();
}
const { loading, refresh } = useAdminAsyncData("submission-review-list", async () => {
    const statusQuery = reviewStatus.value === "all" ? "" : reviewStatus.value === "queue" ? `&status=${reviewQueueStatuses}` : `&status=${encodeURIComponent(reviewStatus.value)}`;
    const spotCheckQuery = spotCheckFilter.value === "all" ? "" : `&spotCheck=${spotCheckFilter.value}`;
    const response = await api<{ items: AdminSubmission[]; total: number }>(`/v1/submissions?page=${page.value}&pageSize=20${statusQuery}${spotCheckQuery}&order=${reviewOrder.value}`);
    if (page.value > 1 && !response.items.length && response.total) page.value -= 1;
    return response;
  }, {
    cacheKey: computed(() => `${page.value}:${reviewStatus.value}:${spotCheckFilter.value}:${reviewOrder.value}`),
    onStart: () => { errorMessage.value = ""; },
    onData: (response) => { submissions.value = response.items; total.value = response.total; },
    onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取待核对截图，请确认当前账号有管理员权限。").description; },
  });
watch(spotCheckFilter, (value) => { reviewStatus.value = statusForSpotCheck(reviewStatus.value, value); }, { flush: "sync" });
watch([reviewStatus, spotCheckFilter, reviewOrder], () => { page.value = 1; }, { flush: "sync" });
watch([reviewStatus, spotCheckFilter, orderOverride, page], () => {
  const query = { ...route.query };
  if (reviewStatus.value === "queue") delete query.status;
  else query.status = reviewStatus.value;
  if (spotCheckFilter.value === "all") delete query.spotCheck;
  else query.spotCheck = spotCheckFilter.value;
  if (orderOverride.value) query.order = orderOverride.value;
  else delete query.order;
  if (page.value === 1) delete query.page;
  else query.page = String(page.value);
  if (JSON.stringify(query) !== JSON.stringify(route.query)) void router.replace({ path: route.path, query }).catch(() => {});
});
watch(() => route.query, (query) => {
  const nextStatus = parseReviewStatus(query.status === undefined ? "queue" : query.status);
  const nextSpotCheck = parseSpotCheck(query.spotCheck);
  const nextOrder = parseOrder(query.order);
  const nextPage = parsePage(query.page);
  if (nextStatus !== reviewStatus.value) reviewStatus.value = nextStatus;
  if (nextSpotCheck !== spotCheckFilter.value) spotCheckFilter.value = nextSpotCheck;
  if (nextOrder !== orderOverride.value) orderOverride.value = nextOrder;
  if (nextPage !== page.value) page.value = nextPage;
});
watch(() => route.fullPath, (path) => { queuePath.value = path; }, { immediate: true });
</script>

<template>
  <AdminWorkspace title="截图审核" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="提交记录"><AdminDataTable v-model:sorting="reviewSorting" :sorting-options="reviewSortingOptions" :default-sorting="defaultReviewSorting" :data="submissions" :columns="columns" :mobile-columns="[{ id: 'ocrContent', priority: 'primary', order: 0 }, { id: 'status', priority: 'primary', order: 1 }, { id: 'playerName', priority: 'detail', order: 2 }, { id: 'spotCheck', priority: 'detail', order: 3 }]" row-key="submissionId" :mobile-row-link="(row) => `/admin/reviews/${encodeURIComponent(row.submissionId)}`" :loading="loading" empty="暂无提交记录。" table-key="reviews" :reset-scroll-key="`${page}-${reviewStatus}-${spotCheckFilter}-${reviewOrder}`" class="admin-table">
      <template #filters><div class="review-filters"><USelect v-model="reviewStatus" aria-label="筛选提交状态" :items="reviewStatusOptions" /><USelect v-model="spotCheckFilter" aria-label="筛选抽检状态" :items="spotCheckOptions" /><USelect v-model="reviewOrder" aria-label="队列顺序" :items="reviewOrderOptions" /><UButton v-if="reevaluable.length" label="重新评估本页待核对项" size="sm" color="neutral" variant="outline" :loading="reevaluating" @click="reevaluatePage" /></div></template>
      <template #mobile-secondary><div class="review-filters"><USelect v-model="reviewStatus" aria-label="筛选提交状态" :items="reviewStatusOptions" /><USelect v-model="spotCheckFilter" aria-label="筛选抽检状态" :items="spotCheckOptions" /><USelect v-model="reviewOrder" aria-label="队列顺序" :items="reviewOrderOptions" /><UButton v-if="reevaluable.length" label="重新评估本页待核对项" size="sm" color="neutral" variant="outline" :loading="reevaluating" @click="reevaluatePage" /></div></template>
      <template #ocrContent-cell="{ row }"><strong>{{ ocrMapName(row.original) }}</strong><small class="table-meta">成就挑战：{{ ocrAchievementTitles(row.original) }}</small></template>
      <template #ocrConfidence-cell="{ row }"><span class="table-meta">地图 {{ ocrConfidence(row.original, "map_name") }}</span><span class="table-meta">成就 {{ ocrConfidence(row.original, "achievement_titles") }}</span></template>
      <template #playerName-cell="{ row }"><NuxtLink class="player-link" :to="`/admin/players/${encodeURIComponent(row.original.playerAccountId)}`">{{ row.original.playerName }}</NuxtLink></template>
      <template #status-cell="{ row }"><StatusBadge :label="formatStatus(row.original.status)" :tone="submissionStatusTone(row.original.status)" /></template>
      <template #spotCheck-cell="{ row }"><StatusBadge v-if="row.original.spotCheck" :label="spotCheckLabel(row.original)" :tone="spotCheckTone(row.original)" /><span v-else class="table-meta">—</span></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><div class="table-actions"><UButton :to="`/admin/reviews/${encodeURIComponent(row.original.submissionId)}`" label="查看" size="sm" color="neutral" variant="outline" /></div></template>
    </AdminDataTable><UPagination v-if="total > 20" v-model:page="page" :total="total" :items-per-page="20" class="pagination" /></section>
  </AdminWorkspace>
</template>

<style scoped>
.review-filters { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.table-meta { display: block; color: var(--quiet); font-size: var(--type-caption-size); }
.player-link { color: var(--accent); font-weight: 600; text-decoration: none; }
.player-link:hover, .player-link:focus-visible { text-decoration: underline; }
.pagination { display: flex; justify-content: center; margin-top: var(--space-3); }
@media (max-width: 48rem) { .review-filters { display: grid; grid-template-columns: 1fr; width: 100%; } }
</style>
