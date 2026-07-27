<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号迁移 · 躲避堡垒 3" });

type Grant = { grantId: string; titleKey: string; label: string; category: string; scope: "global" | "map"; mapName?: string; holderName: string; playerAccountId?: string; playerName?: string; playerId?: string; status: "unclaimed" | "active" | "revoked"; revokeReason?: string };
type Player = { playerAccountId: string; playerName: string; playerId: string };
type HolderGroup = { holderName: string; grants: Grant[]; totalCount: number; unclaimedCount: number };
type MigrationStats = { pendingHolderCount: number; unclaimedGrantCount: number; migratedGrantCount: number };
type MigrationResponse = { items: Grant[]; page: number; pageSize: number; total: number; hasMore: boolean; stats: MigrationStats };

const toast = useToast();
const api = useAdminApi();
const query = shallowRef("");
const grants = shallowRef<Grant[]>([]);
const players = shallowRef<Player[]>([]);
const stats = shallowRef<MigrationStats>({ pendingHolderCount: 0, unclaimedGrantCount: 0, migratedGrantCount: 0 });
const selectedPlayerId = shallowRef("");
const selectedHolderName = shallowRef("");
const filter = shallowRef<"all" | "pending" | "completed">("all");
const page = shallowRef(1);
const pageSize = 20;
const total = shallowRef(0);
const errorMessage = shallowRef("");
const loading = shallowRef(false);
const saving = shallowRef(false);
const selectedHolder = shallowRef<HolderGroup | null>(null);
const bulkHolder = shallowRef<HolderGroup | null>(null);

const holderGroups = computed<HolderGroup[]>(() => {
  const groups = new Map<string, Grant[]>();
  for (const grant of grants.value) groups.set(grant.holderName, [...(groups.get(grant.holderName) ?? []), grant]);
  return [...groups].map(([holderName, holderGrants]) => ({ holderName, grants: holderGrants, totalCount: holderGrants.length, unclaimedCount: holderGrants.filter((grant) => grant.status === "unclaimed").length }));
});
const selectedPlayer = computed(() => players.value.find((player) => player.playerAccountId === selectedPlayerId.value));
const metrics = computed(() => [
  { label: "待处理持有者", value: loading.value ? "读取中…" : `${stats.value.pendingHolderCount}`, detail: "存在未关联称号的历史持有者", icon: "i-lucide-user-round", tone: "accent" as const },
  { label: "未关联称号", value: loading.value ? "读取中…" : `${stats.value.unclaimedGrantCount}`, detail: "待重新关联的称号数量", icon: "i-lucide-link-2-off", tone: "warning" as const },
  { label: "已完成迁移", value: loading.value ? "读取中…" : `${stats.value.migratedGrantCount}`, detail: "历史累计完成迁移", icon: "i-lucide-circle-check", tone: "success" as const },
]);
const pendingGrants = computed(() => bulkHolder.value?.grants.filter((grant) => grant.status === "unclaimed") ?? []);
const pendingGrantsPreview = computed(() => pendingGrants.value.slice(0, 8));
const pendingGrantsOverflow = computed(() => Math.max(0, pendingGrants.value.length - pendingGrantsPreview.value.length));
const panelOpen = computed({ get: () => Boolean(bulkHolder.value && selectedPlayer.value), set: (open) => { if (!open) bulkHolder.value = null; } });

function groupFor(name: string) { return holderGroups.value.find((group) => group.holderName === name) ?? null; }
function selectFirstHolder() { selectedHolderName.value = holderGroups.value[0]?.holderName ?? ""; selectedHolder.value = groupFor(selectedHolderName.value); }
function selectHolder(holder: { holderName: string }) { const full = groupFor(holder.holderName); if (full) { selectedHolderName.value = full.holderName; selectedHolder.value = full; } }

async function load(options: { resetSelection?: boolean } = {}) {
  loading.value = true;
  errorMessage.value = "";
  const previousHolderName = options.resetSelection ? "" : selectedHolderName.value;
  try {
    const [grantResponse, playerResponse] = await Promise.all([
      api<MigrationResponse>(`/v1/title-grants?query=${encodeURIComponent(query.value)}&page=${page.value}&pageSize=${pageSize}`),
      api<{ items: Player[] }>("/v1/player-accounts?page=1&pageSize=50"),
    ]);
    grants.value = grantResponse.items;
    players.value = playerResponse.items;
    stats.value = grantResponse.stats;
    total.value = grantResponse.total;
    const retained = previousHolderName ? groupFor(previousHolderName) : null;
    if (retained) selectHolder(retained);
    else selectFirstHolder();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取历史称号，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

const debouncedLoad = useDebounceFn(() => { page.value = 1; void load({ resetSelection: true }); }, 300);
function handleSearchInput() { debouncedLoad(); }
function updateFilter(value: "all" | "pending" | "completed") {
  filter.value = value;
  const first = holderGroups.value.find((holder) => value === "all" || (value === "pending" ? holder.unclaimedCount > 0 : holder.unclaimedCount === 0));
  if (first) selectHolder(first);
}
function updatePage(value: number) { page.value = value; void load({ resetSelection: true }); }

function openBulk() { if (selectedHolder.value && selectedPlayer.value && selectedHolder.value.unclaimedCount) bulkHolder.value = selectedHolder.value; }
function closeBulk() { bulkHolder.value = null; }

async function grant(row: { grantId: string }) {
  if (!selectedPlayerId.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api("/v1/title-grants", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", playerAccountId: selectedPlayerId.value, historicalTitleGrantId: row.grantId } });
    toast.add({ title: "已关联", color: "success" });
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法关联称号，请稍后重试。").description;
  } finally { saving.value = false; }
}

async function revoke(row: { grantId: string }) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await api(`/v1/title-grants/${row.grantId}/revoke`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1" } });
    toast.add({ title: "已撤销", color: "success" });
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法撤销称号，请稍后重试。").description;
  } finally { saving.value = false; }
}

async function grantAll() {
  if (!bulkHolder.value || !selectedPlayer.value) return;
  saving.value = true;
  errorMessage.value = "";
  const snapshot = pendingGrants.value.map((grant) => grant.mapName ? `${grant.label} · ${grant.mapName}` : grant.label);
  try {
    const result = await api<{ grantedCount: number }>("/v1/title-grants/bulk", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", holderName: bulkHolder.value.holderName, playerAccountId: selectedPlayer.value.playerAccountId } });
    const listed = snapshot.slice(0, 5);
    const overflow = snapshot.length - listed.length;
    toast.add({ title: result.grantedCount ? `已关联 ${result.grantedCount} 项称号` : "暂无可关联称号", description: result.grantedCount ? `${listed.join("、")}${overflow > 0 ? ` 等 +${overflow} 项` : ""}` : undefined, color: "success" });
    await load();
    closeBulk();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法关联称号，请稍后重试。").description;
  } finally { saving.value = false; }
}

onMounted(() => { void load({ resetSelection: true }); });
</script>

<template>
  <AdminWorkspace title="称号迁移" :count="loading ? '读取中…' : `${total} 位持有者`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <AdminTitleMigrationMetrics :metrics="metrics" />
    <section class="migration-workspace" aria-label="称号迁移工作台">
      <AdminTitleMigrationHolders :holders="holderGroups" :selected-holder-name="selectedHolderName" :filter="filter" :query="query" :loading="loading" :total="total" :page="page" :page-size="pageSize" @select="selectHolder" @update:filter="updateFilter" @update:page="updatePage" @update:query="query = $event; handleSearchInput()" />
      <AdminTitleMigrationDetail :holder="selectedHolder" :players="players" :selected-player-id="selectedPlayerId" :loading="loading" :saving="saving" @update:selected-player-id="selectedPlayerId = $event" @grant="grant" @revoke="revoke" @bulk="openBulk" />
    </section>
    <UEmpty v-if="!loading && !total" class="migration-empty" title="暂无匹配记录" description="没有找到符合条件的历史称号。" variant="naked" />
    <AdminResponsiveDialog v-model:open="panelOpen" title="确认称号迁移" size="sm" :dismissible="!saving">
      <template #body><section v-if="bulkHolder && selectedPlayer" class="migration-dialog"><p class="eyebrow">批量关联</p><h2>确认称号迁移</h2><dl class="migration-facts"><div><dt>历史持有者</dt><dd>{{ bulkHolder.holderName }}</dd></div><div><dt>关联至</dt><dd><PlayerBattleTag :player-name="selectedPlayer.playerName" :player-id="selectedPlayer.playerId" /></dd></div></dl><ul class="pending-list" aria-label="待关联称号"><li v-for="grant in pendingGrantsPreview" :key="grant.grantId"><span>{{ grant.label }}</span><small v-if="grant.mapName">{{ grant.mapName }}</small></li><li v-if="pendingGrantsOverflow" class="pending-overflow">另有 {{ pendingGrantsOverflow }} 项未关联称号</li></ul><div class="dialog-actions"><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeBulk" /><UButton label="确认关联" :loading="saving" @click="grantAll" /></div></section></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.migration-intro { display: flex; align-items: end; justify-content: space-between; gap: 28px; }.migration-intro > p { margin: 0; color: var(--muted); }.migration-intro :deep(.alert) { max-width: 560px; }.migration-workspace { display: grid; grid-template-columns: minmax(230px, .7fr) minmax(0, 2fr); gap: 16px; align-items: stretch; }.migration-empty { grid-column: 1 / -1; padding-block: 30px; }.migration-dialog h2 { margin: 0; font-size: 1.75rem; letter-spacing: -.045em; }.migration-facts { display: grid; gap: 9px; margin: 22px 0 16px; }.migration-facts div { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }.migration-facts dt { color: var(--quiet); font-size: .74rem; }.migration-facts dd { margin: 0; font-weight: 680; overflow-wrap: anywhere; }.pending-list { display: grid; gap: 1px; max-height: 280px; margin: 0; padding: 0; overflow: auto; list-style: none; border: 1px solid var(--line); border-radius: 11px; }.pending-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 9px 12px; background: var(--surface); font-size: .84rem; }.pending-list li + li { border-top: 1px solid var(--line); }.pending-list small, .pending-overflow { color: var(--quiet); font-size: .75rem; }.dialog-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 24px; }
@media (max-width: 760px) { .migration-intro { align-items: stretch; flex-direction: column; gap: 16px; }.migration-workspace { grid-template-columns: 1fr; }.dialog-actions { flex-direction: column-reverse; }.dialog-actions :deep(button) { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .dialog-actions :deep(button) { transition: none; } }
@media (prefers-reduced-transparency: reduce) { .migration-intro :deep(.alert), .pending-list li { background: var(--surface-raised); } }
@media (prefers-contrast: more) { .migration-workspace :deep(.holder-panel), .migration-workspace :deep(.detail-panel), .migration-facts div, .pending-list { border-color: var(--line-strong); } }
</style>
