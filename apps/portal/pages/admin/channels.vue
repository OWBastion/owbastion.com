<script setup lang="ts">
import type { AdminGroup } from "~/composables/useAdminApi";
import { reactive, shallowRef } from "vue";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "渠道管理 · 躲避堡垒 3" });
const toast = useToast();
const api = useAdminApi();
const groups = ref<AdminGroup[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const editorOpen = shallowRef(false);
const editingGroup = shallowRef<AdminGroup | null>(null);
const editor = reactive({ displayName: "", environment: "test" as AdminGroup["environment"] });
const savingGroup = shallowRef(false);
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
async function load() { loading.value = true; errorMessage.value = ""; try { groups.value = (await api<{ items: AdminGroup[] }>("/v1/qq/groups")).items; } catch (error) { errorMessage.value = portalErrorDetails(error, "无法读取群配置，请确认当前账号有管理员权限。").description; } finally { loading.value = false; } }
async function save(group: AdminGroup, changes: Partial<AdminGroup> = {}) { const next = { ...group, ...changes }; try { await api(`/v1/qq/groups/${encodeURIComponent(group.groupOpenId)}`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", groupOpenId: next.groupOpenId, displayName: next.displayName, environment: next.environment, status: next.status, bindEnabled: next.bindEnabled, verifyEnabled: next.verifyEnabled } }); Object.assign(group, next); toast.add({ title: next.status === "active" ? "已设为当前活动群" : "群配置已更新", color: "success" }); } catch (error) { throw error; } }
function openEditor(group: AdminGroup) { editingGroup.value = group; editor.displayName = group.displayName; editor.environment = group.environment; editorOpen.value = true; }
function closeEditor() { if (!savingGroup.value) { editorOpen.value = false; editingGroup.value = null; } }
async function saveEditor() { if (!editingGroup.value || !editor.displayName.trim()) return; savingGroup.value = true; try { await save(editingGroup.value, { displayName: editor.displayName.trim(), environment: editor.environment }); editorOpen.value = false; editingGroup.value = null; } catch (error) { errorMessage.value = portalErrorDetails(error, "无法保存群配置，请稍后重试。").description; } finally { savingGroup.value = false; } }
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="渠道管理" :count="loading ? '读取中…' : `${groups.length} 个`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="群配置"><AdminDataTable :data="groups" :columns="columns" :loading="loading" empty="暂无群配置。" table-key="channels" class="admin-table">
      <template #groupOpenId-cell="{ row }"><strong>{{ row.original.displayName || '未命名群组' }}</strong><small class="table-meta">{{ row.original.groupOpenId }}</small></template>
      <template #environment-cell="{ row }"><span>{{ row.original.environment === 'production' ? '正式群' : '测试群' }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="{ pending: '待启用', active: '已启用', legacy: '历史群', disconnected: '已断开' }[row.original.status]" :tone="row.original.status === 'active' ? 'success' : 'warning'" /></template>
      <template #verifyEnabled-cell="{ row }"><USwitch :model-value="row.original.verifyEnabled" :disabled="row.original.status !== 'active'" @update:model-value="save(row.original, { verifyEnabled: !row.original.verifyEnabled })" /></template>
      <template #bindEnabled-cell="{ row }"><USwitch :model-value="row.original.bindEnabled" :disabled="row.original.status !== 'active'" @update:model-value="save(row.original, { bindEnabled: !row.original.bindEnabled })" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><div class="table-actions"><UButton label="编辑" size="xs" color="neutral" variant="outline" @click="openEditor(row.original)" /><UButton v-if="row.original.status !== 'active' && row.original.status !== 'disconnected'" label="设为活动群" size="xs" color="neutral" variant="outline" @click="save(row.original, { status: 'active', bindEnabled: true, verifyEnabled: true })" /></div></template>
    </AdminDataTable></section>
    <AdminResponsiveDialog v-model:open="editorOpen" title="编辑群配置" :description="editingGroup?.groupOpenId" size="sm">
      <template #body><form v-if="editingGroup" id="group-editor" class="editor" @submit.prevent="saveEditor"><UFormField label="群名或标签" hint="QQ 接口不会提供群名，此名称由管理员维护。" required><UInput v-model="editor.displayName" maxlength="128" placeholder="例如：正式服主群" :disabled="savingGroup" /></UFormField><UFormField label="所在环境" required><USelect v-model="editor.environment" :items="[{ label: '正式环境', value: 'production' }, { label: '测试环境', value: 'test' }]" :disabled="savingGroup" :ui="{ base: 'w-full' }" /></UFormField></form></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="savingGroup" @click="closeEditor" /><UButton label="保存配置" type="submit" form="group-editor" :loading="savingGroup" :disabled="!editor.displayName.trim()" /></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { display: block; overflow-wrap: anywhere; color:var(--quiet); font-size:.78rem; }
.table-actions { display:flex; flex-wrap:wrap; gap:.4rem; }
.editor { display:grid; gap:1rem; }
</style>
