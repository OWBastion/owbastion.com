<script setup lang="ts">
import type { AdminPlayer, AdminPlayerDetail } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "玩家管理 · 躲避堡垒 3" });
const toast = useToast();
const api = useAdminApi();
const players = ref<AdminPlayer[]>([]);
const selected = ref<AdminPlayerDetail | null>(null);
const query = ref("");
const status = ref<"all" | "active" | "banned">("all");
const loading = ref(true);
const errorMessage = ref("");
const actionLoading = ref(false);
const page = ref(1);
const total = ref(0);
const panelOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selected.value = null; } });
const statusColumnFilters = computed({
  get: () => status.value === "all" ? [] : [{ id: "status", value: status.value }],
  set: (filters: Array<{ id: string; value: unknown }>) => {
    const value = filters.find((filter) => filter.id === "status")?.value;
    status.value = value === "active" || value === "banned" ? value : "all";
  },
});
const columns = [
  { accessorKey: "battleTag", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "bindingCount", header: "QQ 绑定" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "", enableHiding: false },
];

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await api<{ items: AdminPlayer[]; total: number }>(`/v1/player-accounts?query=${encodeURIComponent(query.value)}&page=${page.value}&pageSize=20${status.value === "all" ? "" : `&status=${status.value}`}`);
    players.value = response.items;
    total.value = response.total;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取玩家帐号，请确认当前账号有管理员权限。";
  } finally { loading.value = false; }
}
async function openPlayer(player: AdminPlayer) {
  selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${player.playerAccountId}`);
}
async function setStatus(next: "active" | "banned") {
  if (!selected.value) return;
  const reason = next === "banned" ? window.prompt("请输入封禁原因") ?? "" : undefined;
  if (next === "banned" && !window.confirm(`确认封禁玩家“${selected.value.playerName}#${selected.value.playerId}”？`)) return;
  actionLoading.value = true;
  try {
    await api(`/v1/player-accounts/${selected.value.playerAccountId}/status`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", status: next, ...(reason ? { reason } : {}) } });
    toast.add({ title: next === "banned" ? "玩家已封禁" : "玩家已解封", color: "success" });
    selected.value.status = next;
    await load();
  } finally { actionLoading.value = false; }
}
async function unbind(bindingId: string) {
  if (!window.confirm("解除这条 QQ 绑定？历史提交会保留。")) return;
  actionLoading.value = true;
  try {
    await api(`/v1/bindings/${bindingId}`, { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } });
    toast.add({ title: "QQ 绑定已解除", color: "success" });
    if (selected.value) selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${selected.value.playerAccountId}`);
    await load();
  } finally { actionLoading.value = false; }
}
watch([query, status], () => { page.value = 1; void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="玩家管理" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="玩家帐号">
      <AdminDataTable v-model:column-filters="statusColumnFilters" v-model:global-filter="query" :data="players" :columns="columns" :loading="loading" empty="暂无匹配玩家。" table-key="players" manual-filtering :reset-scroll-key="page" class="admin-table">
        <template #filters><UInput v-model="query" size="md" aria-label="搜索玩家" placeholder="搜索战网 ID 或 QQ 标识" /><USelect v-model="status" size="md" aria-label="筛选玩家状态" :items="[{ label: '全部状态', value: 'all' }, { label: '正常', value: 'active' }, { label: '已封禁', value: 'banned' }]" /></template>
        <template #battleTag-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
        <template #status-cell="{ row }"><StatusBadge :label="row.original.status === 'banned' ? '已封禁' : '正常'" :tone="row.original.status === 'banned' ? 'warning' : 'success'" /></template>
        <template #bindingCount-cell="{ row }"><span>{{ row.original.bindingCount }} 条</span></template>
        <template #updatedAt-cell="{ row }"><span class="table-meta">{{ new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(row.original.updatedAt) }}</span></template>
        <template #actions-cell="{ row }"><UButton label="查看" color="neutral" variant="link" @click="openPlayer(row.original)" /></template>
      </AdminDataTable>
      <UPagination v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" />
    </section>

    <USlideover v-model:open="panelOpen" :title="selected ? `${selected.playerName}#${selected.playerId}` : ''"><template #body><AdminPlayerDetail v-if="selected" :player="selected" :loading="actionLoading" @set-status="setStatus" @unbind="unbind" /></template></USlideover>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }.pagination { display:flex; justify-content:center; margin-top:16px; }
</style>
