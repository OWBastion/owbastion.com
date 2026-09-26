<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AdminVerifiedRun, AdminVerifiedRunCorrectionChanges, AdminVerifiedRunCorrectionResponse, AdminVerifiedRunDetail, AdminVerifiedRunProjection } from "~/composables/useAdminApi";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "通关记录 · 躲避堡垒 3" });

type PendingAction =
  | { kind: "state"; action: "invalidate" | "restore" }
  | { kind: "conflict"; submissionId: string; action: "keep_existing" | "invalidate_existing" };
type VerifiedRunActionResponse = { contractVersion: "1"; run: AdminVerifiedRun; projection: AdminVerifiedRunProjection };

const api = useAdminApi();
const toast = useToast();
const route = useRoute();
const runs = shallowRef<AdminVerifiedRun[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const page = ref(1);
const total = ref(0);
const matchCode = ref("");
const playerAccountId = ref(typeof route.query.playerAccountId === "string" ? route.query.playerAccountId : "");
const unresolvedConflictsOnly = ref(route.query.unresolvedConflictsOnly === "true");
const mapId = ref("");
const difficulty = ref<"all" | AdminVerifiedRun["difficulty"]>("all");
const runStatus = ref<"all" | AdminVerifiedRun["status"]>("all");
const acceptanceSource = ref<"all" | AdminVerifiedRun["acceptanceSource"]>("all");
const fromDate = ref("");
const toDate = ref("");
const selectedDetail = shallowRef<AdminVerifiedRunDetail | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref("");
const correctionError = ref("");
const correctionMode = ref(false);
const pendingAction = shallowRef<PendingAction | null>(null);
const reason = ref("");
const saving = ref(false);

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const runStatusLabel = (value: AdminVerifiedRun["status"]) => value === "active" ? "有效" : "已作废";
const acceptanceSourceLabel = (value: AdminVerifiedRun["acceptanceSource"]) => value === "submission_automatic" ? "自动通过" : "人工核对";
const actionLabel = computed(() => {
  const action = pendingAction.value;
  if (!action) return "";
  if (action.kind === "state") return action.action === "invalidate" ? "作废通关记录" : "恢复通关记录";
  return action.action === "keep_existing" ? "保留原记录" : "作废原记录";
});
const actionDescription = computed(() => {
  const action = pendingAction.value;
  if (!action) return "";
  if (action.kind === "state") return action.action === "invalidate" ? "该记录将从玩家的当前地图档案中移除。" : "该记录将重新计入玩家的当前地图档案。";
  return action.action === "keep_existing" ? "冲突提交不会改写现有通关记录。" : "原记录将从玩家的当前地图档案中移除；随后可从冲突提交进入正常核对路径。";
});
const actionColor = computed(() => (
  pendingAction.value?.kind === "state" && pendingAction.value.action === "invalidate"
) || (
  pendingAction.value?.kind === "conflict" && pendingAction.value.action === "invalidate_existing"
) ? "error" : "primary");
const difficulties = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;
const columns: TableColumn<AdminVerifiedRun>[] = [
  { id: "map", accessorFn: (row) => row.mapName, header: "地图" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "matchCode", header: "通关码" },
  { accessorKey: "difficulty", header: "难度" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "acceptanceSource", header: "来源" },
  { accessorKey: "acceptedAt", header: "接受时间" },
  { accessorKey: "conflictCount", header: "冲突" },
  { id: "actions", header: "", enableHiding: false },
];

const dateTimestamp = (value: string) => {
  if (!value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};
const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: "20" });
  if (matchCode.value.trim()) params.set("matchCode", matchCode.value.trim());
  if (playerAccountId.value.trim()) params.set("playerAccountId", playerAccountId.value.trim());
  if (unresolvedConflictsOnly.value) params.set("unresolvedConflictsOnly", "true");
  if (mapId.value.trim()) params.set("mapId", mapId.value.trim());
  if (difficulty.value !== "all") params.set("difficulty", difficulty.value);
  if (runStatus.value !== "all") params.set("status", runStatus.value);
  if (acceptanceSource.value !== "all") params.set("acceptanceSource", acceptanceSource.value);
  const from = dateTimestamp(fromDate.value);
  const to = dateTimestamp(toDate.value);
  if (from !== undefined) params.set("from", String(from));
  if (to !== undefined) params.set("to", String(to));
  return params.toString();
});

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await api<{ items: AdminVerifiedRun[]; total: number }>(`/v1/verified-runs?${query.value}`);
    runs.value = response.items;
    total.value = response.total;
    if (page.value > 1 && !runs.value.length && total.value) {
      page.value -= 1;
      await load();
    }
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取通关记录，请确认当前账号有管理员权限。").description;
  } finally {
    loading.value = false;
  }
}

async function loadDetail(verifiedRunId: string) {
  detailLoading.value = true;
  detailError.value = "";
  try {
    selectedDetail.value = await api<AdminVerifiedRunDetail>(`/v1/verified-runs/${encodeURIComponent(verifiedRunId)}`);
  } catch (error) {
    detailError.value = portalErrorDetails(error, "无法读取通关记录详情。").description;
  } finally {
    detailLoading.value = false;
  }
}

async function openDetail(verifiedRunId: string) {
  detailOpen.value = true;
  pendingAction.value = null;
  reason.value = "";
  await loadDetail(verifiedRunId);
}

function closeDetail() {
  detailOpen.value = false;
  correctionMode.value = false;
  pendingAction.value = null;
  reason.value = "";
}

function beginStateAction(action: "invalidate" | "restore") {
  correctionMode.value = false;
  pendingAction.value = { kind: "state", action };
  reason.value = "";
}

function beginConflictAction(input: { submissionId: string; action: "keep_existing" | "invalidate_existing" }) {
  correctionMode.value = false;
  pendingAction.value = { kind: "conflict", ...input };
  reason.value = "";
}

function beginCorrection() {
  pendingAction.value = null;
  correctionError.value = "";
  correctionMode.value = true;
}

function cancelCorrection() {
  correctionMode.value = false;
  correctionError.value = "";
}

function cancelAction() {
  pendingAction.value = null;
  reason.value = "";
}

async function saveAction() {
  const detail = selectedDetail.value;
  const action = pendingAction.value;
  if (!detail || !action || saving.value) return;
  saving.value = true;
  detailError.value = "";
  try {
    const body = { contractVersion: "1" as const, action: action.action, ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) };
    const path = action.kind === "state"
      ? `/v1/verified-runs/${encodeURIComponent(detail.run.runId)}/state`
      : `/v1/verified-runs/${encodeURIComponent(detail.run.runId)}/conflicts/${encodeURIComponent(action.submissionId)}`;
    await api<VerifiedRunActionResponse>(path, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body });
    toast.add({ title: `${actionLabel.value}已完成`, color: "success" });
    pendingAction.value = null;
    reason.value = "";
    await Promise.all([load(), loadDetail(detail.run.runId)]);
  } catch (error) {
    detailError.value = portalErrorDetails(error, "通关记录操作未完成，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

async function saveCorrection(payload: { changes: AdminVerifiedRunCorrectionChanges; reason?: string }) {
  const detail = selectedDetail.value;
  if (!detail || saving.value) return;
  saving.value = true;
  correctionError.value = "";
  try {
    const response = await api<AdminVerifiedRunCorrectionResponse>(`/v1/verified-runs/${encodeURIComponent(detail.run.runId)}/corrections`, {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", changes: payload.changes, ...(payload.reason ? { reason: payload.reason } : {}) },
    });
    selectedDetail.value = response.detail;
    correctionMode.value = false;
    toast.add({ title: "通关记录事实已更正", color: "success" });
    await Promise.all([load(), loadDetail(detail.run.runId)]);
  } catch (error) {
    correctionError.value = portalErrorDetails(error, "更正未完成，请检查更正数据后重试。").description;
  } finally {
    saving.value = false;
  }
}

watch([matchCode, playerAccountId, unresolvedConflictsOnly, mapId, difficulty, runStatus, acceptanceSource, fromDate, toDate], () => {
  page.value = 1;
  void load();
});
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="通关记录" :count="loading ? '读取中…' : `${total} 条`">
    <template #actions><UButton class="admin-workspace__icon-action hit-target-lg" icon="i-lucide-refresh-cw" square color="neutral" variant="outline" aria-label="刷新" :loading="loading" @click="load" /></template>
    <template #messages>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    </template>
    <section aria-label="通关记录列表">
      <AdminDataTable :data="runs" :columns="columns" :mobile-columns="[{ id: 'map', priority: 'primary', order: 0 }, { id: 'playerName', priority: 'primary', order: 1 }, { id: 'status', priority: 'detail', order: 2 }, { id: 'matchCode', priority: 'detail', order: 3 }, { id: 'conflictCount', priority: 'detail', order: 4 }]" row-key="runId" :mobile-row-action="(row) => openDetail(row.runId)" :loading="loading" empty="暂无匹配通关记录。" table-key="verified-runs" manual-filtering :reset-scroll-key="`${page}-${query}`">
        <template #filters>
          <div class="verified-run-filters">
            <UInput v-model="matchCode" aria-label="按通关码筛选" placeholder="通关码" />
            <UInput v-model="playerAccountId" aria-label="按玩家账号筛选" placeholder="玩家账号 ID" />
            <USelect v-model="unresolvedConflictsOnly" aria-label="筛选冲突状态" :items="[{ label: '全部通关记录', value: false }, { label: '待处理冲突', value: true }]" />
            <UInput v-model="mapId" aria-label="按地图筛选" placeholder="地图 ID" />
            <USelect v-model="difficulty" aria-label="筛选难度" :items="[{ label: '全部难度', value: 'all' }, ...difficulties.map((value) => ({ label: value, value }))]" />
            <USelect v-model="runStatus" aria-label="筛选记录状态" :items="[{ label: '全部记录状态', value: 'all' }, { label: '有效', value: 'active' }, { label: '已作废', value: 'invalidated' }]" />
            <USelect v-model="acceptanceSource" aria-label="筛选接受来源" :items="[{ label: '全部接受来源', value: 'all' }, { label: '自动通过', value: 'submission_automatic' }, { label: '人工核对', value: 'submission_review' }]" />
            <UInput v-model="fromDate" type="datetime-local" aria-label="接受时间开始" />
            <UInput v-model="toDate" type="datetime-local" aria-label="接受时间结束" />
          </div>
        </template>
        <template #mobile-primary><UInput v-model="matchCode" class="w-full" aria-label="按通关码筛选" placeholder="通关码" /></template>
        <template #mobile-secondary>
          <div class="verified-run-filters">
            <UInput v-model="playerAccountId" aria-label="按玩家账号筛选" placeholder="玩家账号 ID" />
            <USelect v-model="unresolvedConflictsOnly" aria-label="筛选冲突状态" :items="[{ label: '全部通关记录', value: false }, { label: '待处理冲突', value: true }]" />
            <UInput v-model="mapId" aria-label="按地图筛选" placeholder="地图 ID" />
            <USelect v-model="difficulty" aria-label="筛选难度" :items="[{ label: '全部难度', value: 'all' }, ...difficulties.map((value) => ({ label: value, value }))]" />
            <USelect v-model="runStatus" aria-label="筛选记录状态" :items="[{ label: '全部记录状态', value: 'all' }, { label: '有效', value: 'active' }, { label: '已作废', value: 'invalidated' }]" />
            <USelect v-model="acceptanceSource" aria-label="筛选接受来源" :items="[{ label: '全部接受来源', value: 'all' }, { label: '自动通过', value: 'submission_automatic' }, { label: '人工核对', value: 'submission_review' }]" />
            <UInput v-model="fromDate" type="datetime-local" aria-label="接受时间开始" />
            <UInput v-model="toDate" type="datetime-local" aria-label="接受时间结束" />
          </div>
        </template>
        <template #map-cell="{ row }"><strong>{{ row.original.mapName }}</strong><span class="table-meta">{{ row.original.mapId }}</span></template>
        <template #playerName-cell="{ row }"><NuxtLink class="player-link" :to="`/admin/players/${encodeURIComponent(row.original.playerAccountId)}`">{{ row.original.playerName }}</NuxtLink><span class="table-meta">{{ row.original.playerId }}</span></template>
        <template #matchCode-cell="{ row }"><span class="run-code">{{ row.original.matchCode }}</span></template>
        <template #status-cell="{ row }"><StatusBadge :label="runStatusLabel(row.original.status)" :tone="row.original.status === 'active' ? 'success' : 'warning'" /></template>
        <template #acceptanceSource-cell="{ row }"><span class="table-meta">{{ acceptanceSourceLabel(row.original.acceptanceSource) }}</span></template>
        <template #acceptedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.acceptedAt) }}</span></template>
        <template #conflictCount-cell="{ row }"><StatusBadge v-if="row.original.conflictCount" :label="`${row.original.conflictCount} 条`" tone="warning" /><span v-else class="table-meta">—</span></template>
        <template #actions-cell="{ row }"><div class="table-actions"><UButton label="详情" size="sm" color="neutral" variant="outline" @click="openDetail(row.original.runId)" /></div></template>
      </AdminDataTable>
      <UPagination v-if="total > 20" v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" />
    </section>
  </AdminWorkspace>

  <AdminResponsiveDialog v-model:open="detailOpen" :title="correctionMode ? '更正通关记录事实' : selectedDetail ? `${selectedDetail.run.mapName} · ${selectedDetail.run.difficulty}` : '通关记录'" size="xl" :dismissible="!saving" @update:open="(open) => { if (!open) closeDetail(); }">
    <template #body>
      <div v-if="detailLoading" class="detail-loading" role="status" aria-label="读取中"><USkeleton v-for="index in 6" :key="index" class="h-12" /></div>
      <UAlert v-else-if="detailError" color="error" variant="subtle" :description="detailError" />
      <AdminVerifiedRunCorrectionForm v-else-if="correctionMode && selectedDetail" :run="selectedDetail.run" :saving="saving" :error="correctionError" @submit="saveCorrection" @cancel="cancelCorrection" />
      <AdminVerifiedRunDetail v-else-if="selectedDetail" :detail="selectedDetail" :action-loading="saving || Boolean(pendingAction)" @correct="beginCorrection" @state="beginStateAction" @conflict="beginConflictAction" />
      <div v-if="pendingAction" class="verified-run-confirmation">
        <p>{{ actionDescription }}</p>
        <UFormField label="操作理由"><UTextarea v-model="reason" aria-label="操作理由" :rows="3" :disabled="saving" /></UFormField>
      </div>
    </template>
    <template v-if="pendingAction && !correctionMode" #footer>
      <UButton :label="actionLabel" :color="actionColor" :variant="actionColor === 'error' ? 'soft' : 'solid'" :loading="saving" @click="saveAction" />
      <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="cancelAction" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.verified-run-filters { display: flex; flex-wrap: wrap; gap: .5rem; width: 100%; }
.verified-run-filters > * { flex: 1 1 10rem; min-width: 9rem; }
.table-meta { display: block; color: var(--quiet); font-size: .78rem; }
.player-link { color: var(--accent); font-weight: 600; text-decoration: none; }
.player-link:hover,
.player-link:focus-visible { text-decoration: underline; }
.run-code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: .82rem; }
.pagination { display: flex; justify-content: center; margin-top: .75rem; }
.detail-loading { display: grid; gap: .625rem; }
.verified-run-confirmation { display: grid; gap: .75rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--line); }
.verified-run-confirmation p { margin: 0; font-size: .875rem; }
@media (max-width: 47.99rem) {
  .verified-run-filters { display: grid; grid-template-columns: 1fr; }
  .verified-run-filters > * { min-width: 0; }
}
</style>
