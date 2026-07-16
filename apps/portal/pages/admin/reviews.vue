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
const trigger = ref<HTMLElement | null>(null);
const panelOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selected.value = null; } });
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const columns = [
  { accessorKey: "challenge", header: "挑战" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "updatedAt", header: "最近更新" },
  { id: "actions", header: "" },
];
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    const [ready, reviewRequired] = await Promise.all([
      api<{ items: AdminSubmission[] }>("/v1/submissions?status=ready_for_review"),
      api<{ items: AdminSubmission[] }>("/v1/submissions?status=ocr_review_required"),
    ]);
    submissions.value = [...ready.items, ...reviewRequired.items].sort((left, right) => right.updatedAt - left.updatedAt);
  }
  catch (error: any) { errorMessage.value = error?.data?.error?.message ?? "无法读取待核对截图，请确认当前账号有管理员权限。"; }
  finally { loading.value = false; }
}
async function open(submission: AdminSubmission, event: EventTarget | null) { trigger.value = event instanceof HTMLElement ? event : null; selected.value = await api<AdminSubmission>(`/v1/submissions/${submission.submissionId}`); }
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
  <AdminWorkspace title="审核管理" :count="loading ? '读取中…' : `${submissions.length} 条`">
    <template #messages><p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p></template>
    <section aria-label="待核对截图"><UTable :data="submissions" :columns="columns" :loading="loading" empty="暂无待核对截图。" class="admin-table">
      <template #challenge-cell="{ row }"><strong>{{ row.original.mapName }} · {{ row.original.difficulty }}</strong></template>
      <template #playerName-cell="{ row }"><span>{{ row.original.playerName }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="formatStatus(row.original.status)" :tone="row.original.status === 'ocr_review_required' ? 'warning' : 'success'" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><PortalButton tone="text" type="button" @click="open(row.original, $event.currentTarget)">查看</PortalButton></template>
    </UTable></section>
    <PortalSidePanel v-model:open="panelOpen" :title="selected ? `${selected.mapName} · ${selected.difficulty}` : ''" :return-focus="trigger"><section v-if="selected" class="admin-detail review-detail"><h2>{{ selected.mapName }} · {{ selected.difficulty }}</h2><p class="admin-detail__meta">{{ selected.playerName }} · {{ formatStatus(selected.status) }}</p><img class="evidence" :src="`/api/admin/evidence/${selected.submissionId}`" alt="玩家提交的挑战截图" /><pre v-if="selected.ocr" class="ocr">{{ JSON.stringify(selected.ocr, null, 2) }}</pre><div class="actions"><PortalButton type="button" @click="review('approved')">通过</PortalButton><PortalButton tone="secondary" type="button" @click="review('resubmission_required')">要求重传</PortalButton><PortalButton tone="danger" type="button" @click="review('rejected')">驳回</PortalButton></div></section></PortalSidePanel>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }.evidence { display:block; width:100%; margin:22px 0; border:1px solid var(--line); border-radius:10px; }.ocr { max-height:240px; overflow:auto; padding:12px; color:var(--muted); background:var(--surface); font-size:.72rem; white-space:pre-wrap; }.actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
</style>
