<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";
import type { AdminSubmission } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "审核管理 · 躲避堡垒 3" });
const api = useAdminApi();
const submissions = ref<AdminSubmission[]>([]);
const selected = ref<AdminSubmission | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const page = ref(1);
const total = ref(0);
const panelOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selected.value = null; } });
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const columns = [
  { accessorKey: "challenge", header: "挑战" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "", enableHiding: false },
];
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    const response = await api<{ items: AdminSubmission[]; total: number }>(`/v1/submissions?status=ready_for_review,ocr_review_required&page=${page.value}&pageSize=20`);
    submissions.value = response.items;
    total.value = response.total;
    if (page.value > 1 && !submissions.value.length && total.value) {
      page.value--;
      await load();
    }
  }
  catch (error: any) { errorMessage.value = error?.data?.error?.message ?? "无法读取待核对截图，请确认当前账号有管理员权限。"; }
  finally { loading.value = false; }
}
async function open(submission: AdminSubmission) { selected.value = await api<AdminSubmission>(`/v1/submissions/${submission.submissionId}`); }
async function review(decision: "approved" | "rejected" | "resubmission_required") {
  if (!selected.value) return;
  const reason = window.prompt("请输入处理说明")?.trim();
  if (!reason) return;
  await api(`/v1/submissions/${selected.value.submissionId}/review`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", decision, reason } });
  close(); await load();
}
function close() { selected.value = null; }
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="审核管理" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="待核对截图"><AdminDataTable :data="submissions" :columns="columns" :loading="loading" empty="暂无待核对截图。" table-key="reviews" scroll-height="32rem" :reset-scroll-key="page" class="admin-table">
      <template #challenge-cell="{ row }"><strong>{{ row.original.mapName }} · {{ row.original.difficulty }}</strong></template>
      <template #playerName-cell="{ row }"><span>{{ row.original.playerName }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="formatStatus(row.original.status)" :tone="row.original.status === 'ocr_review_required' ? 'warning' : 'success'" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><UButton label="查看" color="neutral" variant="link" @click="open(row.original)" /></template>
    </AdminDataTable><UPagination v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" /></section>
    <USlideover v-model:open="panelOpen" :title="selected ? `${selected.mapName} · ${selected.difficulty}` : ''"><template #body><section v-if="selected" class="admin-detail review-detail"><h2>{{ selected.mapName }} · {{ selected.difficulty }}</h2><p class="admin-detail__meta">{{ selected.playerName }} · {{ formatStatus(selected.status) }}</p><img class="evidence" :src="`/api/admin/evidence/${selected.submissionId}`" alt="玩家提交的挑战截图" /><pre v-if="selected.ocr" class="ocr">{{ JSON.stringify(selected.ocr, null, 2) }}</pre><div class="actions"><UButton label="通过" @click="review('approved')" /><UButton label="要求重传" color="neutral" variant="outline" @click="review('resubmission_required')" /><UButton label="驳回" color="error" @click="review('rejected')" /></div></section></template></USlideover>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }.pagination { display:flex; justify-content:center; margin-top:16px; }.evidence { display:block; width:100%; margin:22px 0; border:1px solid var(--line); border-radius:10px; }.ocr { max-height:240px; overflow:auto; padding:12px; color:var(--muted); background:var(--surface); font-size:.72rem; white-space:pre-wrap; }.actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
</style>
