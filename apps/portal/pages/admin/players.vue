<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";
import type { AdminPlayer, AdminPlayerDetail } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "玩家管理 · 躲避堡垒 3" });
const api = useAdminApi();
const players = ref<AdminPlayer[]>([]);
const selected = ref<AdminPlayerDetail | null>(null);
const query = ref("");
const status = ref<"all" | "active" | "banned">("all");
const loading = ref(true);
const errorMessage = ref("");
const actionMessage = ref("");
const page = ref(1);
const hasMore = ref(false);
const trigger = ref<HTMLElement | null>(null);
const panelOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selected.value = null; } });
const columns = [
  { accessorKey: "battleTag", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "bindingCount", header: "QQ 绑定" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "" },
];

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatBattleTag = (player: { playerName: string; playerId: string }) => `${player.playerName}#${player.playerId}`;
const formatSubmissionStatus = (value: string) => submissionStatusText[value] ?? value;
async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await api<{ items: AdminPlayer[]; hasMore: boolean }>(`/v1/player-accounts?query=${encodeURIComponent(query.value)}&page=${page.value}&pageSize=20${status.value === "all" ? "" : `&status=${status.value}`}`);
    players.value = response.items;
    hasMore.value = response.hasMore;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取玩家帐号，请确认当前账号有管理员权限。";
  } finally { loading.value = false; }
}
async function openPlayer(player: AdminPlayer, event: EventTarget | null) {
  trigger.value = event instanceof HTMLElement ? event : null;
  selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${player.playerAccountId}`);
}
async function setStatus(next: "active" | "banned") {
  if (!selected.value) return;
  const reason = next === "banned" ? window.prompt("请输入封禁原因（可选）") ?? "" : undefined;
  if (next === "banned" && !window.confirm(`确认封禁玩家“${formatBattleTag(selected.value)}”？`)) return;
  actionMessage.value = "保存中…";
  await api(`/v1/player-accounts/${selected.value.playerAccountId}/status`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", status: next, ...(reason ? { reason } : {}) } });
  actionMessage.value = next === "banned" ? "玩家已封禁" : "玩家已解封";
  selected.value.status = next;
  await load();
}
async function unbind(bindingId: string) {
  if (!window.confirm("解除这条 QQ 绑定？历史提交会保留。")) return;
  actionMessage.value = "解除绑定中…";
  await api(`/v1/bindings/${bindingId}`, { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } });
  actionMessage.value = "QQ 绑定已解除";
  if (selected.value) selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${selected.value.playerAccountId}`);
  await load();
}
watch([query, status], () => { page.value = 1; void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="玩家管理" :count="loading ? '读取中…' : `${players.length} 条`">
    <template #messages><p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p><p v-if="actionMessage" class="admin-feedback" role="status">{{ actionMessage }}</p></template>
    <template #toolbar><div class="admin-toolbar"><PortalInput v-model="query" aria-label="搜索玩家" placeholder="搜索战网 ID 或 QQ 标识" /><PortalSelect v-model="status" aria-label="筛选玩家状态" :items="[{ label: '全部状态', value: 'all' }, { label: '正常', value: 'active' }, { label: '已封禁', value: 'banned' }]" /></div></template>

    <section aria-label="玩家帐号">
      <UTable :data="players" :columns="columns" :loading="loading" empty="暂无匹配玩家。" class="admin-table">
        <template #battleTag-cell="{ row }"><strong>{{ formatBattleTag(row.original) }}</strong></template>
        <template #status-cell="{ row }"><StatusBadge :label="row.original.status === 'banned' ? '已封禁' : '正常'" :tone="row.original.status === 'banned' ? 'warning' : 'success'" /></template>
        <template #bindingCount-cell="{ row }"><span>{{ row.original.bindingCount }} 条</span></template>
        <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
        <template #actions-cell="{ row }"><PortalButton tone="text" type="button" @click="openPlayer(row.original, $event.currentTarget)">查看</PortalButton></template>
      </UTable>
      <div class="pagination"><PortalButton tone="secondary" :disabled="page === 1" type="button" @click="page--; load()">上一页</PortalButton><span>第 {{ page }} 页</span><PortalButton tone="secondary" :disabled="!hasMore" type="button" @click="page++; load()">下一页</PortalButton></div>
    </section>

    <PortalSidePanel v-model:open="panelOpen" :title="selected ? formatBattleTag(selected) : ''" :return-focus="trigger"><section v-if="selected" class="admin-detail player-detail"><h2>{{ formatBattleTag(selected) }}</h2><p class="admin-detail__meta">最近更新 {{ formatTime(selected.updatedAt) }}</p><div class="actions"><PortalButton v-if="selected.status === 'active'" tone="danger" type="button" @click="setStatus('banned')">封禁玩家</PortalButton><PortalButton v-else type="button" @click="setStatus('active')">解除封禁</PortalButton></div><h3>QQ 绑定</h3><div class="binding-list"><div v-for="binding in selected.bindings" :key="binding.bindingId" class="binding"><div><strong>{{ binding.groupOpenId }}</strong><small>{{ binding.memberOpenId }}</small></div><PortalButton tone="text" type="button" @click="unbind(binding.bindingId)">解绑</PortalButton></div><p v-if="!selected.bindings.length" class="quiet">暂无 QQ 绑定。</p></div><h3>最近提交</h3><div class="submission-list"><div v-for="submission in selected.recentSubmissions" :key="submission.submissionId"><strong>{{ submission.mapName }}</strong><small>{{ formatSubmissionStatus(submission.status) }} · {{ formatTime(submission.updatedAt) }}</small></div><p v-if="!selected.recentSubmissions.length" class="quiet">暂无提交记录。</p></div></section></PortalSidePanel>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta,.binding small,.submission-list small { color:var(--quiet); font-size:.78rem; }.pagination { display:flex; align-items:center; justify-content:center; gap:14px; margin-top:16px; color:var(--muted); font-size:.78rem; }.actions { margin-bottom:32px; }.player-detail h3 { margin:26px 0 10px; font-size:.8rem; letter-spacing:.04em; text-transform:uppercase; }.binding-list,.submission-list { display:grid; gap:9px; }.binding,.submission-list > div { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px; border:1px solid var(--line); border-radius:10px; }.submission-list > div { display:block; }.binding strong,.binding small,.submission-list strong,.submission-list small { display:block; }.binding small,.submission-list small { margin-top:5px; }.quiet { color:var(--quiet); font-size:.8rem; }@media (max-width:560px){.binding{align-items:flex-start;flex-direction:column}}
</style>
