<script setup lang="ts">
import type { AdminGroup } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "渠道管理 · 躲避堡垒 3" });
const api = useAdminApi();
const groups = ref<AdminGroup[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const actionMessage = ref("");
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const columns = [
  { accessorKey: "groupOpenId", header: "群组" },
  { accessorKey: "environment", header: "环境" },
  { accessorKey: "enabled", header: "状态" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "" },
];
async function load() { loading.value = true; errorMessage.value = ""; try { groups.value = (await api<{ items: AdminGroup[] }>("/v1/qq/groups")).items; } catch (error: any) { errorMessage.value = error?.data?.error?.message ?? "无法读取群配置，请确认当前账号有管理员权限。"; } finally { loading.value = false; } }
async function setGroup(group: AdminGroup) { const enabled = !group.enabled; group.enabled = enabled; try { await api(`/v1/qq/groups/${encodeURIComponent(group.groupOpenId)}`, { method: "PUT", body: { contractVersion: "1", groupOpenId: group.groupOpenId, environment: group.environment, enabled } }); actionMessage.value = enabled ? "群已开放" : "群已关闭"; } catch (error) { group.enabled = !enabled; throw error; } }
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="渠道管理" :count="loading ? '读取中…' : `${groups.length} 个`">
    <template #messages><p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p><p v-if="actionMessage" class="admin-feedback" role="status">{{ actionMessage }}</p></template>
    <section aria-label="群配置"><UTable :data="groups" :columns="columns" :loading="loading" empty="暂无群配置。" class="admin-table">
      <template #groupOpenId-cell="{ row }"><strong>{{ row.original.groupOpenId }}</strong></template>
      <template #environment-cell="{ row }"><span>{{ row.original.environment === 'production' ? '正式群' : '测试群' }}</span></template>
      <template #enabled-cell="{ row }"><StatusBadge :label="row.original.enabled ? '已开放' : '已关闭'" :tone="row.original.enabled ? 'success' : 'warning'" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><button class="toggle" :class="{ enabled: row.original.enabled }" type="button" :aria-pressed="row.original.enabled" @click="setGroup(row.original)"><span class="track" aria-hidden="true"><span /></span>{{ row.original.enabled ? '关闭' : '开放' }}</button></template>
    </UTable></section>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }.toggle { display:inline-flex; min-height:40px; align-items:center; gap:9px; padding:0 11px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:var(--surface-raised); font-size:.76rem; font-weight:680; }.track { display:inline-flex; width:30px; height:18px; align-items:center; padding:2px; border-radius:999px; background:var(--quiet); }.track > span { width:14px; height:14px; border-radius:50%; background:var(--surface); box-shadow:0 1px 2px var(--shadow); transition:transform 160ms ease; }.toggle.enabled { color:var(--text); border-color:color-mix(in oklch,var(--accent) 55%,var(--line)); }.toggle.enabled .track { background:var(--accent); }.toggle.enabled .track > span { transform:translateX(12px); }
</style>
