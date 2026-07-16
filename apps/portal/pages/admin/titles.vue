<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号迁移 · 躲避堡垒 3" });

type Grant = { grantId: string; titleKey: string; label: string; category: string; scope: "global" | "map"; mapName?: string; holderName: string; playerAccountId?: string; playerName?: string; playerId?: string; status: "unclaimed" | "active" | "revoked"; revokeReason?: string };
type Player = { playerAccountId: string; playerName: string; playerId: string };
type HolderGroup = { holderName: string; grants: Grant[]; unclaimedCount: number };

const api = useAdminApi();
const query = ref("");
const grants = ref<Grant[]>([]);
const players = ref<Player[]>([]);
const selectedPlayerId = ref("");
const message = ref("");
const errorMessage = ref("");
const loading = ref(false);
const saving = ref(false);
const selectedHolder = ref<HolderGroup | null>(null);
const panelOpen = computed({ get: () => selectedHolder.value !== null && selectedPlayer.value !== undefined, set: (value) => { if (!value) selectedHolder.value = null; } });

const selectedPlayer = computed(() => players.value.find((player) => player.playerAccountId === selectedPlayerId.value));
const holderGroups = computed<HolderGroup[]>(() => {
  const groups = new Map<string, Grant[]>();
  for (const grant of grants.value) groups.set(grant.holderName, [...(groups.get(grant.holderName) ?? []), grant]);
  return [...groups].map(([holderName, holderGrants]) => ({ holderName, grants: holderGrants, unclaimedCount: holderGrants.filter((grant) => grant.status === "unclaimed").length }));
});

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [grantResponse, playerResponse] = await Promise.all([
      api<{ items: Grant[] }>(`/v1/title-grants?query=${encodeURIComponent(query.value)}`),
      api<{ items: Player[] }>("/v1/player-accounts?page=1&pageSize=50"),
    ]);
    grants.value = grantResponse.items;
    players.value = playerResponse.items;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取历史称号，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

async function grant(row: Grant) {
  if (!selectedPlayerId.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api("/v1/title-grants", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", playerAccountId: selectedPlayerId.value, historicalTitleGrantId: row.grantId } });
    message.value = "已关联";
    await load();
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法关联称号，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

async function revoke(row: Grant) {
  const reason = window.prompt("请输入撤销原因")?.trim();
  if (!reason) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api(`/v1/title-grants/${row.grantId}/revoke`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", reason } });
    message.value = "已撤销";
    await load();
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法撤销称号，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

function openBulk(group: HolderGroup) {
  if (!selectedPlayer.value || !group.unclaimedCount) return;
  selectedHolder.value = group;
}

function closeBulk() {
  selectedHolder.value = null;
}

async function grantAll() {
  if (!selectedHolder.value || !selectedPlayer.value) return;
  saving.value = true;
  errorMessage.value = "";
  message.value = "关联中…";
  try {
    const result = await api<{ grantedCount: number }>("/v1/title-grants/bulk", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", holderName: selectedHolder.value.holderName, playerAccountId: selectedPlayer.value.playerAccountId },
    });
    message.value = result.grantedCount ? `已关联 ${result.grantedCount} 项` : "暂无可关联称号";
    await load();
    closeBulk();
  } catch (error: any) {
    message.value = "";
    errorMessage.value = error?.data?.error?.message ?? "无法关联称号，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="称号迁移" :count="loading ? '读取中…' : `${holderGroups.length} 位持有者`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><UAlert v-if="message" color="primary" variant="subtle" :description="message" /></template>
    <template #toolbar><div class="admin-toolbar"><UInput v-model="query" placeholder="搜索持有者或称号" aria-label="搜索历史称号" @change="load" /><USelect v-model="selectedPlayerId" aria-label="选择玩家" placeholder="选择玩家帐号" :items="players.map((player) => ({ label: `${player.playerName}#${player.playerId}`, value: player.playerAccountId }))" /><UButton label="搜索" color="neutral" variant="outline" @click="load" /></div></template>

    <div class="holder-list" aria-live="polite">
      <section v-for="group in holderGroups" :key="group.holderName" class="holder-group">
        <div class="holder-heading"><div><p class="eyebrow">历史持有者</p><h2>{{ group.holderName }}</h2><small>{{ group.unclaimedCount ? `${group.unclaimedCount} 项未关联` : "暂无未关联称号" }}</small></div><UButton :data-holder-name="group.holderName" label="关联全部未关联项" :disabled="!selectedPlayer || !group.unclaimedCount || saving" @click="openBulk(group)" /></div>
        <div class="grant-list"><UCard v-for="row in group.grants" :key="row.grantId" class="grant-row" variant="subtle"><template #default><div><p>{{ row.category }}</p><h3>{{ row.label }}<span v-if="row.mapName"> · {{ row.mapName }}</span></h3><small>{{ row.status === "unclaimed" ? "未关联" : row.status === "active" ? `已关联至 ${row.playerName}#${row.playerId}` : "已撤销" }}</small></div><UButton v-if="row.status === 'unclaimed'" label="关联" color="neutral" variant="outline" :disabled="!selectedPlayer || saving" @click="grant(row)" /><UButton v-else-if="row.status === 'active'" label="撤销" color="neutral" variant="link" :disabled="saving" @click="revoke(row)" /></template></UCard></div>
      </section>
      <p v-if="!loading && !holderGroups.length" class="empty surface-card">暂无匹配记录。</p>
    </div>

    <USlideover v-model:open="panelOpen" title="确认称号迁移"><template #body><section v-if="selectedHolder && selectedPlayer" class="sheet"><p class="eyebrow">批量关联</p><h2 id="bulk-migration-title">确认称号迁移</h2><div class="migration-facts"><p><span>历史持有者</span><strong>{{ selectedHolder.holderName }}</strong></p><p><span>关联至</span><strong><PlayerBattleTag :player-name="selectedPlayer.playerName" :player-id="selectedPlayer.playerId" /></strong></p><p><span>范围</span><strong>全部未关联称号</strong></p></div><p class="sheet-copy">已关联和已撤销记录保持不变。</p><div class="sheet-actions"><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeBulk" /><UButton label="确认关联" :loading="saving" @click="grantAll" /></div></section></template></USlideover>
  </AdminWorkspace>
</template>

<style scoped>
.holder-list { display: grid; gap: 28px; }.holder-group { display: grid; gap: 10px; }.holder-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }.holder-heading .eyebrow { margin-bottom: 6px; }.holder-heading h2 { margin: 0; font-size: clamp(1.3rem, 3vw, 1.75rem); letter-spacing: -.035em; overflow-wrap: anywhere; }.holder-heading small, .grant-row p, .grant-row small { color: var(--quiet); font-size: .78rem; }.grant-list { display: grid; gap: 9px; }.grant-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 17px 18px; }.grant-row p, .grant-row small { display: block; margin: 0; }.grant-row h3 { margin: 8px 0; font-size: 1.05rem; overflow-wrap: anywhere; }.danger { color: var(--danger); }.empty { margin: 0; padding: 28px; color: var(--quiet); text-align: center; }.sheet { position: relative; }.sheet h2 { margin: 0; font-size: 2.1rem; letter-spacing: -.05em; }.migration-facts { display: grid; gap: 12px; margin: 28px 0 18px; }.migration-facts p { display: grid; gap: 5px; margin: 0; padding: 13px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }.migration-facts span { color: var(--quiet); font-size: .76rem; }.migration-facts strong { overflow-wrap: anywhere; font-size: .92rem; }.sheet-copy { color: var(--muted); font-size: .83rem; line-height: 1.5; }.sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 30px; }
@media (prefers-reduced-motion: reduce) { .migration-sheet-enter-active, .migration-sheet-leave-active, .migration-sheet-enter-active .sheet, .migration-sheet-leave-active .sheet { transition: opacity 140ms ease; }.migration-sheet-enter-from .sheet, .migration-sheet-leave-to .sheet { transform: none; } }
@media (max-width: 620px) { .grant-row { align-items: stretch; flex-direction: column; }.holder-heading { align-items: start; flex-direction: column; }.sheet-actions { flex-direction: column-reverse; }.sheet-actions button { width: 100%; } }
</style>
