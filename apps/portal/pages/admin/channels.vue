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
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><UAlert v-if="actionMessage" color="primary" variant="subtle" :description="actionMessage" /></template>
    <section aria-label="群配置"><UTable :data="groups" :columns="columns" :loading="loading" empty="暂无群配置。" class="admin-table">
      <template #groupOpenId-cell="{ row }"><strong>{{ row.original.groupOpenId }}</strong></template>
      <template #environment-cell="{ row }"><span>{{ row.original.environment === 'production' ? '正式群' : '测试群' }}</span></template>
      <template #enabled-cell="{ row }"><StatusBadge :label="row.original.enabled ? '已开放' : '已关闭'" :tone="row.original.enabled ? 'success' : 'warning'" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><USwitch :model-value="row.original.enabled" :label="row.original.enabled ? '已开放' : '已关闭'" @update:model-value="setGroup(row.original)" /></template>
    </UTable></section>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }
</style>
