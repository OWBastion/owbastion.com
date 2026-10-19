<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";
import type { AdminSubmission } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { reviewQueueStatuses } from "~/utils/reviewQueue";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "审核 · 躲避堡垒 3" });
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
function parseMode(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "all";
}
const page = ref(parsePage(route.query.page));
const modeFilter = shallowRef(parseMode(route.query.mode));
const modes = ref<string[]>([]);
const modeOptions = computed(() => [{ label: "全部模式", value: "all" }, { label: "常规模式", value: "regular" }, ...modes.value.map((mode) => ({ label: mode, value: mode }))]);
onMounted(async () => {
  try { modes.value = (await api<{ items: Array<{ mode: string }> }>("/v1/standalone-modes")).items.map((item) => item.mode); } catch { /* the filter then offers only the regular mode */ }
});
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
// Non-default secondary filters, counted on the filter button so a narrowed list never looks complete.
const extraFilterCount = computed(() => [spotCheckFilter.value !== "all", modeFilter.value !== "all", orderOverride.value !== null].filter(Boolean).length);
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
  { id: "select", header: "", enableHiding: false },
  { accessorFn: (row) => ocrMapName(row), id: "ocrContent", header: "OCR识别" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "updatedAt", header: "最近更新" },
];
const toast = useToast();
const selected = ref<string[]>([]);
const selectedItems = computed(() => submissions.value.filter((item) => selected.value.includes(item.submissionId)));
const reevaluable = computed(() => selectedItems.value.filter((item) => item.status === "ocr_review_required"));
const reopenable = computed(() => selectedItems.value.filter((item) => item.status === "approved"));
const allSelected = computed(() => submissions.value.length > 0 && selected.value.length === submissions.value.length);
const toggleAll = (checked: boolean) => { selected.value = checked ? submissions.value.map((item) => item.submissionId) : []; };
const toggleOne = (id: string, checked: boolean) => { selected.value = checked ? [...new Set([...selected.value, id])] : selected.value.filter((value) => value !== id); };
const bulkRunning = ref(false);
const reopenConfirmOpen = ref(false);
// Each selected submission goes through the same single-item operation (own idempotency key, own audit), so a failure
// affects only that one and stays selected for a retry; submissions a bulk action does not apply to are skipped.
async function runBulk(action: "reevaluate" | "reopen") {
  if (bulkRunning.value) return;
  const items = [...(action === "reevaluate" ? reevaluable.value : reopenable.value)];
  if (!items.length) return;
  bulkRunning.value = true;
  const skipped = selected.value.length - items.length;
  const failedIds: string[] = [];
  let changed = 0;
  for (const item of items) {
    try {
      const path = action === "reevaluate" ? "ocr/reevaluate" : "reopen";
      const result = await api<{ status: string }>(`/v1/submissions/${encodeURIComponent(item.submissionId)}/${path}`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
      if (result.status !== item.status) changed += 1;
    } catch { failedIds.push(item.submissionId); }
  }
  bulkRunning.value = false;
  reopenConfirmOpen.value = false;
  const verb = action === "reevaluate" ? "重新评估" : "重新打开";
  toast.add({ title: `已${verb} ${items.length - failedIds.length} 条${action === "reevaluate" ? `，其中 ${changed} 条状态已更新` : ""}${skipped ? `，跳过 ${skipped} 条不适用` : ""}${failedIds.length ? `，${failedIds.length} 条失败` : ""}`, color: failedIds.length ? "warning" : "success" });
  await refresh();
  selected.value = failedIds.filter((id) => submissions.value.some((item) => item.submissionId === id));
}
const { loading, refresh } = useAdminAsyncData("submission-review-list", async () => {
    const statusQuery = reviewStatus.value === "all" ? "" : reviewStatus.value === "queue" ? `&status=${reviewQueueStatuses}` : `&status=${encodeURIComponent(reviewStatus.value)}`;
    const spotCheckQuery = spotCheckFilter.value === "all" ? "" : `&spotCheck=${spotCheckFilter.value}`;
    const modeQuery = modeFilter.value === "all" ? "" : `&mode=${encodeURIComponent(modeFilter.value)}`;
    const response = await api<{ items: AdminSubmission[]; total: number }>(`/v1/submissions?page=${page.value}&pageSize=20${statusQuery}${spotCheckQuery}${modeQuery}&order=${reviewOrder.value}`);
    if (page.value > 1 && !response.items.length && response.total) page.value -= 1;
    return response;
  }, {
    cacheKey: computed(() => `${page.value}:${reviewStatus.value}:${spotCheckFilter.value}:${modeFilter.value}:${reviewOrder.value}`),
    onStart: () => { errorMessage.value = ""; },
    onData: (response) => { submissions.value = response.items; total.value = response.total; selected.value = selected.value.filter((id) => response.items.some((item) => item.submissionId === id)); },
    onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取待核对截图，请确认当前账号有管理员权限。").description; },
  });
watch(spotCheckFilter, (value) => { reviewStatus.value = statusForSpotCheck(reviewStatus.value, value); }, { flush: "sync" });
watch([reviewStatus, spotCheckFilter, modeFilter, reviewOrder], () => { page.value = 1; selected.value = []; }, { flush: "sync" });
watch([reviewStatus, spotCheckFilter, modeFilter, orderOverride, page], () => {
  const query = { ...route.query };
  if (reviewStatus.value === "queue") delete query.status;
  else query.status = reviewStatus.value;
  if (spotCheckFilter.value === "all") delete query.spotCheck;
  else query.spotCheck = spotCheckFilter.value;
  if (modeFilter.value === "all") delete query.mode;
  else query.mode = modeFilter.value;
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
  const nextMode = parseMode(query.mode);
  const nextPage = parsePage(query.page);
  if (nextStatus !== reviewStatus.value) reviewStatus.value = nextStatus;
  if (nextSpotCheck !== spotCheckFilter.value) spotCheckFilter.value = nextSpotCheck;
  if (nextMode !== modeFilter.value) modeFilter.value = nextMode;
  if (nextOrder !== orderOverride.value) orderOverride.value = nextOrder;
  if (nextPage !== page.value) page.value = nextPage;
});
watch(() => route.fullPath, (path) => { queuePath.value = path; }, { immediate: true });
</script>

<template>
  <AdminWorkspace title="审核" :count="loading ? undefined : String(total)">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="提交记录"><AdminDataTable v-model:sorting="reviewSorting" :sorting-options="reviewSortingOptions" :default-sorting="defaultReviewSorting" :data="submissions" :columns="columns" :mobile-columns="[{ id: 'ocrContent', priority: 'primary', order: 0 }, { id: 'status', priority: 'primary', order: 1 }, { id: 'playerName', priority: 'detail', order: 2 }]" row-key="submissionId" :mobile-row-link="(row) => `/admin/reviews/${encodeURIComponent(row.submissionId)}`" :loading="loading" empty="没有待办" table-key="reviews" :reset-scroll-key="`${page}-${reviewStatus}-${spotCheckFilter}-${reviewOrder}`" class="admin-table">
      <template #filters><div class="review-filters"><USelect v-model="reviewStatus" aria-label="筛选提交状态" :items="reviewStatusOptions" /><UPopover><UButton icon="i-lucide-sliders-horizontal" :label="extraFilterCount ? String(extraFilterCount) : undefined" color="neutral" :variant="extraFilterCount ? 'soft' : 'ghost'" aria-label="更多筛选" /><template #content><div class="review-filters__more"><USelect v-model="spotCheckFilter" aria-label="筛选抽检状态" :items="spotCheckOptions" /><USelect v-model="modeFilter" aria-label="筛选识别模式" :items="modeOptions" /><USelect v-model="reviewOrder" aria-label="队列顺序" :items="reviewOrderOptions" /></div></template></UPopover><template v-if="selected.length"><span class="table-meta">{{ selected.length }}</span><UButton v-if="reevaluable.length" :label="`重新评估 ${reevaluable.length}`" size="sm" color="neutral" variant="outline" :loading="bulkRunning" @click="runBulk('reevaluate')" /><UButton v-if="reopenable.length" :label="`重新打开 ${reopenable.length}`" size="sm" color="neutral" variant="outline" :disabled="bulkRunning" @click="reopenConfirmOpen = true" /></template></div></template>
      <template #mobile-secondary><div class="review-filters"><USelect v-model="reviewStatus" aria-label="筛选提交状态" :items="reviewStatusOptions" /><UPopover><UButton icon="i-lucide-sliders-horizontal" :label="extraFilterCount ? String(extraFilterCount) : undefined" color="neutral" :variant="extraFilterCount ? 'soft' : 'ghost'" aria-label="更多筛选" /><template #content><div class="review-filters__more"><USelect v-model="spotCheckFilter" aria-label="筛选抽检状态" :items="spotCheckOptions" /><USelect v-model="modeFilter" aria-label="筛选识别模式" :items="modeOptions" /><USelect v-model="reviewOrder" aria-label="队列顺序" :items="reviewOrderOptions" /></div></template></UPopover><template v-if="selected.length"><span class="table-meta">{{ selected.length }}</span><UButton v-if="reevaluable.length" :label="`重新评估 ${reevaluable.length}`" size="sm" color="neutral" variant="outline" :loading="bulkRunning" @click="runBulk('reevaluate')" /><UButton v-if="reopenable.length" :label="`重新打开 ${reopenable.length}`" size="sm" color="neutral" variant="outline" :disabled="bulkRunning" @click="reopenConfirmOpen = true" /></template></div></template>
      <template #select-header><UCheckbox :model-value="allSelected" aria-label="选择本页全部提交" @update:model-value="toggleAll(Boolean($event))" /></template>
      <template #select-cell="{ row }"><UCheckbox :model-value="selected.includes(row.original.submissionId)" :aria-label="`选择 ${row.original.playerName} 的提交`" @update:model-value="toggleOne(row.original.submissionId, Boolean($event))" /></template>
      <template #ocrContent-cell="{ row }"><NuxtLink class="review-link" :to="`/admin/reviews/${encodeURIComponent(row.original.submissionId)}`"><strong>{{ ocrMapName(row.original) }}</strong><small class="table-meta">{{ ocrAchievementTitles(row.original) }}</small></NuxtLink></template>
      <template #playerName-cell="{ row }"><NuxtLink class="accent-link" :to="`/admin/players/${encodeURIComponent(row.original.playerAccountId)}`">{{ row.original.playerName }}</NuxtLink></template>
      <template #status-cell="{ row }"><span class="status-stack"><StatusBadge :label="formatStatus(row.original.status)" :tone="submissionStatusTone(row.original.status)" /><StatusBadge v-if="row.original.spotCheck" :label="spotCheckLabel(row.original)" :tone="spotCheckTone(row.original)" /></span></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
    </AdminDataTable><UPagination v-if="total > 20" v-model:page="page" :total="total" :items-per-page="20" class="pagination" /></section>
    <AdminResponsiveDialog v-model:open="reopenConfirmOpen" title="重新打开所选提交？" :description="`将撤销所选 ${reopenable.length} 条已通过提交产生的称号和通关记录（手动发放的称号不受影响），并回到待核对。之后需要逐条重新通过，系统会按截图重新判定。`" size="md" :dismissible="!bulkRunning">
      <template #footer>
        <UButton label="确认重新打开" :loading="bulkRunning" :disabled="bulkRunning" @click="runBulk('reopen')" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="bulkRunning" @click="reopenConfirmOpen = false" />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.review-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.review-filters__more { display: grid; gap: var(--space-2); padding: var(--space-3); }
.review-link { display: grid; color: inherit; text-decoration: none; }
.review-link:hover strong { color: var(--accent); }
.status-stack { display: inline-flex; flex-wrap: wrap; gap: var(--space-1); }
.table-meta { display: block; color: var(--quiet); font-size: var(--type-caption-size); }
@media (max-width: 48rem) { .review-filters { display: grid; grid-template-columns: 1fr; width: 100%; } }
</style>
