<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号迁移 · 躲避堡垒 3" });

type Grant = { grantId: string; titleKey: string; label: string; category: string; scope: "global" | "map"; mapName?: string; holderName: string; playerAccountId?: string; playerName?: string; playerId?: string; status: "unclaimed" | "active" | "revoked"; revokeReason?: string };
type Player = { playerAccountId: string; playerName: string; playerId: string };
type HolderSummary = { holderName: string; totalCount: number; unclaimedCount: number; status: "pending" | "completed" };
type HolderDetail = HolderSummary & { grants: Grant[]; grantPage: number; grantPageSize: number; grantTotal: number; grantHasMore: boolean };
type MigrationStats = { pendingHolderCount: number; unclaimedGrantCount: number; migratedGrantCount: number };
type HolderListResponse = { holders: HolderSummary[]; page: number; pageSize: number; total: number; hasMore: boolean; filter: "all" | "pending" | "completed"; stats: MigrationStats };
type HolderDetailResponse = { holder: HolderSummary; items: Grant[]; page: number; pageSize: number; total: number; hasMore: boolean };
type BulkPreviewGrant = { grantId: string; label: string; mapName?: string };

const toast = useToast();
const api = useAdminApi();
const query = shallowRef("");
const holders = shallowRef<HolderSummary[]>([]);
const stats = shallowRef<MigrationStats>({ pendingHolderCount: 0, unclaimedGrantCount: 0, migratedGrantCount: 0 });
const selectedPlayerId = shallowRef("");
const selectedPlayer = shallowRef<Player | null>(null);
const playerOptions = shallowRef<Player[]>([]);
const playerQuery = shallowRef("");
const playerLoading = shallowRef(false);
const playerError = shallowRef("");
const playerPage = shallowRef(1);
const playerPageSize = 20;
const playerHasMore = shallowRef(false);
const playerTotal = shallowRef(0);

const selectedHolderName = shallowRef("");
const selectedHolder = shallowRef<HolderDetail | null>(null);
const filter = shallowRef<"all" | "pending" | "completed">("all");
const page = shallowRef(1);
const pageSize = 20;
const total = shallowRef(0);
const grantPage = shallowRef(1);
const grantPageSize = 50;
const errorMessage = shallowRef("");
const detailError = shallowRef("");
const loading = shallowRef(false);
const detailLoading = shallowRef(false);
const saving = shallowRef(false);
const bulkOpen = shallowRef(false);
const bulkPreview = shallowRef<BulkPreviewGrant[]>([]);
const bulkAffectedCount = shallowRef(0);
const bulkLoading = shallowRef(false);

const metrics = computed(() => [
  { label: "待处理持有者", value: loading.value ? "读取中…" : `${stats.value.pendingHolderCount}`, detail: "存在未关联称号的历史持有者", icon: "i-lucide-user-round", tone: "accent" as const },
  { label: "未关联称号", value: loading.value ? "读取中…" : `${stats.value.unclaimedGrantCount}`, detail: "待重新关联的称号数量", icon: "i-lucide-link-2-off", tone: "warning" as const },
  { label: "已完成迁移", value: loading.value ? "读取中…" : `${stats.value.migratedGrantCount}`, detail: "历史累计完成迁移", icon: "i-lucide-circle-check", tone: "success" as const },
]);
const pendingGrantsPreview = computed(() => bulkPreview.value.slice(0, 8));
const pendingGrantsOverflow = computed(() => Math.max(0, bulkAffectedCount.value - pendingGrantsPreview.value.length));
const panelOpen = computed({
  get: () => bulkOpen.value && Boolean(selectedHolder.value && selectedPlayer.value),
  set: (open) => { if (!open) closeBulk(); },
});

async function loadHolders(options: { resetSelection?: boolean } = {}) {
  loading.value = true;
  errorMessage.value = "";
  const previousHolderName = options.resetSelection ? "" : selectedHolderName.value;
  try {
    const response = await api<HolderListResponse>(`/v1/title-grants?query=${encodeURIComponent(query.value)}&filter=${filter.value}&page=${page.value}&pageSize=${pageSize}`);
    holders.value = response.holders;
    stats.value = response.stats;
    total.value = response.total;
    const retained = previousHolderName ? response.holders.find((holder) => holder.holderName === previousHolderName) : null;
    if (retained) {
      selectedHolderName.value = retained.holderName;
      await loadHolderDetail(retained.holderName, grantPage.value);
    } else if (response.holders[0]) {
      await selectHolder(response.holders[0]);
    } else {
      selectedHolderName.value = "";
      selectedHolder.value = null;
    }
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取历史称号，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

async function loadHolderDetail(holderName: string, nextGrantPage = grantPage.value) {
  detailLoading.value = true;
  detailError.value = "";
  try {
    const response = await api<HolderDetailResponse>(`/v1/title-grants/holder?holderName=${encodeURIComponent(holderName)}&page=${nextGrantPage}&pageSize=${grantPageSize}`);
    grantPage.value = response.page;
    selectedHolderName.value = response.holder.holderName;
    selectedHolder.value = {
      ...response.holder,
      grants: response.items,
      grantPage: response.page,
      grantPageSize: response.pageSize,
      grantTotal: response.total,
      grantHasMore: response.hasMore,
    };
    holders.value = holders.value.map((holder) => holder.holderName === response.holder.holderName ? response.holder : holder);
  } catch (error) {
    detailError.value = portalErrorDetails(error, "无法读取持有者详情，请稍后重试。").description;
    selectedHolder.value = null;
  } finally {
    detailLoading.value = false;
  }
}

async function selectHolder(holder: { holderName: string }) {
  selectedHolderName.value = holder.holderName;
  grantPage.value = 1;
  await loadHolderDetail(holder.holderName, 1);
}

async function loadPlayers(options: { search?: string; page?: number; append?: boolean } = {}) {
  const search = options.search ?? playerQuery.value;
  const nextPage = options.page ?? 1;
  const append = options.append === true;
  playerLoading.value = true;
  playerError.value = "";
  try {
    const response = await api<{ items: Player[]; total: number; hasMore: boolean; page: number; pageSize: number }>(
      `/v1/player-accounts?query=${encodeURIComponent(search.trim())}&page=${nextPage}&pageSize=${playerPageSize}`,
    );
    playerPage.value = response.page;
    playerHasMore.value = response.hasMore;
    playerTotal.value = response.total;
    const merged = append
      ? [...playerOptions.value, ...response.items.filter((player) => !playerOptions.value.some((existing) => existing.playerAccountId === player.playerAccountId))]
      : response.items;
    playerOptions.value = selectedPlayer.value && !merged.some((player) => player.playerAccountId === selectedPlayer.value!.playerAccountId)
      ? [selectedPlayer.value, ...merged]
      : merged;
  } catch (error) {
    playerError.value = portalErrorDetails(error, "无法读取玩家帐号，请稍后重试。").description;
    if (!append) playerOptions.value = selectedPlayer.value ? [selectedPlayer.value] : [];
    playerHasMore.value = false;
  } finally {
    playerLoading.value = false;
  }
}

const debouncedLoadHolders = useDebounceFn(() => { page.value = 1; void loadHolders({ resetSelection: true }); }, 300);
const debouncedLoadPlayers = useDebounceFn((value: string) => {
  playerPage.value = 1;
  playerHasMore.value = false;
  void loadPlayers({ search: value, page: 1, append: false });
}, 300);

function handleSearchInput(value: string) {
  query.value = value;
  debouncedLoadHolders();
}

function updateFilter(value: "all" | "pending" | "completed") {
  filter.value = value;
  page.value = 1;
  void loadHolders({ resetSelection: true });
}

function updatePage(value: number) {
  page.value = value;
  void loadHolders({ resetSelection: true });
}

function updateGrantPage(value: number) {
  if (!selectedHolderName.value) return;
  grantPage.value = value;
  void loadHolderDetail(selectedHolderName.value, value);
}

function updateSelectedPlayerId(value: string) {
  selectedPlayerId.value = value;
  selectedPlayer.value = playerOptions.value.find((player) => player.playerAccountId === value) ?? selectedPlayer.value;
}

function handlePlayerSearch(value: string) {
  playerQuery.value = value;
  debouncedLoadPlayers(value);
}

function loadMorePlayers() {
  if (playerLoading.value || !playerHasMore.value) return;
  void loadPlayers({ page: playerPage.value + 1, append: true });
}

async function openBulk() {
  if (!selectedHolder.value || !selectedPlayer.value || !selectedHolder.value.unclaimedCount) return;
  bulkLoading.value = true;
  bulkOpen.value = true;
  detailError.value = "";
  try {
    const response = await api<HolderDetailResponse>(`/v1/title-grants/holder?holderName=${encodeURIComponent(selectedHolder.value.holderName)}&grantStatus=unclaimed&page=1&pageSize=8`);
    bulkAffectedCount.value = response.holder.unclaimedCount;
    bulkPreview.value = response.items.map((grant) => ({ grantId: grant.grantId, label: grant.label, mapName: grant.mapName }));
    selectedHolder.value = {
      ...selectedHolder.value,
      ...response.holder,
      grants: selectedHolder.value.grants,
    };
    if (!response.holder.unclaimedCount) {
      bulkOpen.value = false;
      detailError.value = "当前持有者没有可关联的未关联称号。";
    }
  } catch (error) {
    bulkOpen.value = false;
    detailError.value = portalErrorDetails(error, "无法准备批量关联预览，请稍后重试。").description;
  } finally {
    bulkLoading.value = false;
  }
}

function closeBulk() {
  bulkOpen.value = false;
  bulkPreview.value = [];
  bulkAffectedCount.value = 0;
}

async function reconcileAfterWrite() {
  await loadHolders();
}

async function grant(row: { grantId: string }) {
  const player = selectedPlayer.value;
  if (!player) return;
  saving.value = true;
  errorMessage.value = "";
  detailError.value = "";
  try {
    await api("/v1/title-grants", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", playerAccountId: player.playerAccountId, historicalTitleGrantId: row.grantId } });
    toast.add({ title: "已关联", color: "success" });
    await reconcileAfterWrite();
  } catch (error) {
    detailError.value = portalErrorDetails(error, "无法关联称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

async function revoke(row: { grantId: string }) {
  saving.value = true;
  errorMessage.value = "";
  detailError.value = "";
  try {
    await api(`/v1/title-grants/${row.grantId}/revoke`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
    toast.add({ title: "已撤销", color: "success" });
    await reconcileAfterWrite();
  } catch (error) {
    detailError.value = portalErrorDetails(error, "无法撤销称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

async function grantAll() {
  const holder = selectedHolder.value;
  const player = selectedPlayer.value;
  if (!holder || !player || !bulkOpen.value) return;
  saving.value = true;
  errorMessage.value = "";
  detailError.value = "";
  try {
    const result = await api<{ grantedCount: number; skippedClaimedCount?: number }>("/v1/title-grants/bulk", {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", holderName: holder.holderName, playerAccountId: player.playerAccountId },
    });
    const listed = pendingGrantsPreview.value.map((grant) => grant.mapName ? `${grant.label} · ${grant.mapName}` : grant.label);
    const overflow = Math.max(0, result.grantedCount - listed.length);
    if (result.grantedCount) {
      toast.add({
        title: `已关联 ${result.grantedCount} 项称号`,
        description: `${listed.slice(0, 5).join("、")}${overflow > 0 || listed.length > 5 ? ` 等 +${Math.max(overflow, listed.length - 5)} 项` : ""}`,
        color: "success",
      });
    } else {
      toast.add({
        title: "暂无可关联称号",
        description: result.skippedClaimedCount ? `已跳过 ${result.skippedClaimedCount} 项已关联记录` : undefined,
        color: "neutral",
      });
    }
    closeBulk();
    await reconcileAfterWrite();
  } catch (error) {
    detailError.value = portalErrorDetails(error, "无法关联称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadHolders({ resetSelection: true });
  void loadPlayers({ search: "", page: 1, append: false });
});
</script>

<template>
  <AdminWorkspace title="称号迁移" :count="loading ? '读取中…' : `${total} 位持有者`">
    <template #messages>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
      <UAlert v-else-if="detailError" color="error" variant="subtle" :description="detailError" />
    </template>
    <AdminTitleMigrationMetrics :metrics="metrics" />
    <section class="migration-workspace" aria-label="称号迁移工作台">
      <AdminTitleMigrationHolders
        :holders="holders"
        :selected-holder-name="selectedHolderName"
        :filter="filter"
        :query="query"
        :loading="loading"
        :total="total"
        :page="page"
        :page-size="pageSize"
        @select="selectHolder"
        @update:filter="updateFilter"
        @update:page="updatePage"
        @update:query="handleSearchInput"
      />
      <AdminTitleMigrationDetail
        :holder="selectedHolder"
        :players="playerOptions"
        :selected-player-id="selectedPlayerId"
        :player-loading="playerLoading"
        :player-error="playerError"
        :player-query="playerQuery"
        :player-has-more="playerHasMore"
        :player-total="playerTotal"
        :loading="loading || detailLoading"
        :saving="saving || bulkLoading"
        :grant-page="grantPage"
        :grant-page-size="grantPageSize"
        @update:selected-player-id="updateSelectedPlayerId"
        @update:player-query="handlePlayerSearch"
        @update:grant-page="updateGrantPage"
        @load-more-players="loadMorePlayers"
        @grant="grant"
        @revoke="revoke"
        @bulk="openBulk"
      />

    </section>
    <UEmpty v-if="!loading && !total" class="migration-empty" title="暂无匹配记录" description="没有找到符合条件的历史称号。" variant="naked" />
    <AdminResponsiveDialog v-model:open="panelOpen" title="确认称号迁移" size="sm" :dismissible="!saving">
      <template #body>
        <section v-if="selectedHolder && selectedPlayer" class="migration-dialog">
          <p class="eyebrow">批量关联</p>
          <h2>确认称号迁移</h2>
          <dl class="migration-facts">
            <div><dt>历史持有者</dt><dd>{{ selectedHolder.holderName }}</dd></div>
            <div><dt>关联至</dt><dd><PlayerBattleTag :player-name="selectedPlayer.playerName" :player-id="selectedPlayer.playerId" /></dd></div>
            <div><dt>影响范围</dt><dd>{{ bulkAffectedCount }} 项未关联称号</dd></div>
          </dl>
          <ul class="pending-list" aria-label="待关联称号">
            <li v-for="grant in pendingGrantsPreview" :key="grant.grantId">
              <span>{{ grant.label }}</span>
              <small v-if="grant.mapName">{{ grant.mapName }}</small>
            </li>
            <li v-if="pendingGrantsOverflow" class="pending-overflow">另有 {{ pendingGrantsOverflow }} 项未关联称号</li>
            <li v-if="!pendingGrantsPreview.length && !bulkLoading" class="pending-overflow">没有可预览的未关联称号</li>
          </ul>
        </section>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeBulk" />
        <UButton label="确认关联" :loading="saving || bulkLoading" :disabled="!bulkAffectedCount" @click="grantAll" />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.migration-workspace { display: grid; grid-template-columns: minmax(230px, .7fr) minmax(0, 2fr); gap: 16px; align-items: stretch; }
.migration-empty { grid-column: 1 / -1; padding-block: 30px; }
.migration-dialog h2 { margin: 0; font-size: 1.75rem; letter-spacing: -.045em; }
.migration-facts { display: grid; gap: 9px; margin: 22px 0 16px; }
.migration-facts div { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }
.migration-facts dt { color: var(--quiet); font-size: .74rem; }
.migration-facts dd { margin: 0; font-weight: 680; overflow-wrap: anywhere; }
.pending-list { display: grid; gap: 1px; max-height: 280px; margin: 0; padding: 0; overflow: auto; list-style: none; border: 1px solid var(--line); border-radius: 11px; }
.pending-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 9px 12px; background: var(--surface); font-size: .84rem; }
.pending-list li + li { border-top: 1px solid var(--line); }
.pending-list small, .pending-overflow { color: var(--quiet); font-size: .75rem; }
@media (max-width: 760px) { .migration-workspace { grid-template-columns: 1fr; } }
@media (prefers-reduced-transparency: reduce) { .pending-list li { background: var(--surface-raised); } }
@media (prefers-contrast: more) { .migration-workspace :deep(.holder-panel), .migration-workspace :deep(.detail-panel), .migration-facts div, .pending-list { border-color: var(--line-strong); } }
</style>
