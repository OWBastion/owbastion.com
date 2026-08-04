<script setup lang="ts">
import type { SortingState } from "@tanstack/vue-table";
import type { AdminPlayer } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "玩家管理 · 躲避堡垒 3" });
const api = useAdminApi();
const players = ref<AdminPlayer[]>([]);
const query = ref("");
const status = ref<"all" | "active" | "banned">("all");
const loading = ref(true);
const errorMessage = ref("");
const page = ref(1);
const total = ref(0);
const defaultPlayerSorting: SortingState = [{ id: "updatedAt", desc: true }];
const playerSorting = shallowRef<SortingState>([...defaultPlayerSorting]);
const playerSortingOptions = [
  { id: "playerName", label: "玩家" },
  { id: "status", label: "状态" },
  { id: "bindingCount", label: "QQ 绑定" },
  { id: "updatedAt", label: "最近更新" },
];
const statusColumnFilters = computed({
  get: () => status.value === "all" ? [] : [{ id: "status", value: status.value }],
  set: (filters: Array<{ id: string; value: unknown }>) => {
    const value = filters.find((filter) => filter.id === "status")?.value;
    status.value = value === "active" || value === "banned" ? value : "all";
  },
});
const columns = [
  { accessorKey: "playerName", header: "玩家" },
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
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取玩家帐号，请确认当前账号有管理员权限。").description;
  } finally { loading.value = false; }
}

watch([query, status], () => { page.value = 1; void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="玩家管理" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="玩家帐号">
      <AdminDataTable v-model:column-filters="statusColumnFilters" v-model:global-filter="query" v-model:sorting="playerSorting" :sorting-options="playerSortingOptions" :default-sorting="defaultPlayerSorting" :data="players" :columns="columns" :mobile-columns="[{ id: 'playerName', priority: 'primary', order: 0 }, { id: 'status', priority: 'primary', order: 1 }, { id: 'bindingCount', priority: 'detail', order: 2 }, { id: 'updatedAt', priority: 'detail', order: 3 }]" :loading="loading" empty="暂无匹配玩家。" table-key="players" manual-filtering :reset-scroll-key="page" class="admin-table">
        <template #filters><UInput v-model="query" size="md" aria-label="搜索玩家" placeholder="搜索战网 ID 或 QQ 标识" /><USelect v-model="status" size="md" aria-label="筛选玩家状态" :items="[{ label: '全部状态', value: 'all' }, { label: '正常', value: 'active' }, { label: '已封禁', value: 'banned' } ]" /></template>
        <template #playerName-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
        <template #status-cell="{ row }"><StatusBadge :label="row.original.status === 'banned' ? '已封禁' : '正常'" :tone="row.original.status === 'banned' ? 'warning' : 'success'" /></template>
        <template #bindingCount-cell="{ row }"><span>{{ row.original.bindingCount }} 条</span></template>
        <template #updatedAt-cell="{ row }"><span class="table-meta">{{ new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(row.original.updatedAt) }}</span></template>
        <template #actions-cell="{ row }"><div class="table-actions"><UButton :to="`/admin/players/${row.original.playerAccountId}`" label="查看详情" size="sm" color="neutral" variant="outline" /></div></template>
      </AdminDataTable>
      <UPagination v-if="total > 20" v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" />
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }.pagination { display:flex; justify-content:center; margin-top:16px; }
</style>
