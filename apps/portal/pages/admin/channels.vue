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
  { accessorKey: "status", header: "状态" },
  { accessorKey: "verifyEnabled", header: "/验证" },
  { accessorKey: "bindEnabled", header: "/绑定" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "", enableHiding: false },
];
async function load() { loading.value = true; errorMessage.value = ""; try { groups.value = (await api<{ items: AdminGroup[] }>("/v1/qq/groups")).items; } catch (error: any) { errorMessage.value = error?.data?.error?.message ?? "无法读取群配置，请确认当前账号有管理员权限。"; } finally { loading.value = false; } }
async function save(group: AdminGroup, changes: Partial<AdminGroup> = {}) { const next = { ...group, ...changes }; try { await api(`/v1/qq/groups/${encodeURIComponent(group.groupOpenId)}`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", groupOpenId: next.groupOpenId, environment: next.environment, status: next.status, bindEnabled: next.bindEnabled, verifyEnabled: next.verifyEnabled } }); Object.assign(group, next); actionMessage.value = next.status === "active" ? "已设为当前活动群" : "群配置已更新"; } catch (error) { throw error; } }
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="渠道管理" :count="loading ? '读取中…' : `${groups.length} 个`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><UAlert v-if="actionMessage" color="primary" variant="subtle" :description="actionMessage" /></template>
    <section aria-label="群配置"><AdminDataTable :data="groups" :columns="columns" :loading="loading" empty="暂无群配置。" table-key="channels" class="admin-table">
      <template #groupOpenId-cell="{ row }"><strong>{{ row.original.groupOpenId }}</strong></template>
      <template #environment-cell="{ row }"><span>{{ row.original.environment === 'production' ? '正式群' : '测试群' }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="{ pending: '待启用', active: '活动中', legacy: '历史群', disconnected: '已断开' }[row.original.status]" :tone="row.original.status === 'active' ? 'success' : 'warning'" /></template>
      <template #verifyEnabled-cell="{ row }"><USwitch :model-value="row.original.verifyEnabled" :disabled="row.original.status !== 'active'" @update:model-value="save(row.original, { verifyEnabled: !row.original.verifyEnabled })" /></template>
      <template #bindEnabled-cell="{ row }"><USwitch :model-value="row.original.bindEnabled" :disabled="row.original.status !== 'active'" @update:model-value="save(row.original, { bindEnabled: !row.original.bindEnabled })" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><UButton v-if="row.original.status !== 'active' && row.original.status !== 'disconnected'" label="设为活动群" size="xs" color="neutral" variant="outline" @click="save(row.original, { status: 'active', bindEnabled: true, verifyEnabled: true })" /></template>
    </AdminDataTable></section>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }
</style>
