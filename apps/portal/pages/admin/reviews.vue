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
type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };
const panelOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selected.value = null; } });
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const ocrPayload = computed(() => selected.value?.ocr as OcrPayload | null);
const ocrLabels: Record<string, string> = { map_name: "地图", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记" };
const ocrFields = computed(() => Object.entries(ocrPayload.value?.fields ?? {}).filter(([name]) => name in ocrLabels));
const ocrValue = (value: unknown) => value === null || value === undefined ? "未识别" : value === true ? "已识别完成" : value === false ? "未识别完成" : String(value);
const ocrConfidence = (value: unknown) => typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
const visibleStatuses = "received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required,approved,rejected,resubmission_required";
const isDecisionComplete = (status: string) => ["approved", "rejected", "resubmission_required"].includes(status);
const statusTone = (status: string) => status === "ready_for_review" ? "success" : status === "ocr_review_required" ? "warning" : "default";
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
    const response = await api<{ items: AdminSubmission[]; total: number }>(`/v1/submissions?status=${visibleStatuses}&page=${page.value}&pageSize=20`);
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
  await api(`/v1/submissions/${selected.value.submissionId}/review`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", decision } });
  const toast = useToast();
  toast.add({ title: decision === "approved" ? "审核已批准" : decision === "rejected" ? "审核已拒绝" : "已要求重新提交", color: "success" });
  close(); await load();
}
function close() { selected.value = null; }
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="审核管理" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="提交记录"><AdminDataTable :data="submissions" :columns="columns" :loading="loading" empty="暂无提交记录。" table-key="reviews" :reset-scroll-key="page" class="admin-table">
      <template #challenge-cell="{ row }"><strong>{{ row.original.mapName }} · {{ row.original.difficulty }}</strong></template>
      <template #playerName-cell="{ row }"><span>{{ row.original.playerName }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="formatStatus(row.original.status)" :tone="statusTone(row.original.status)" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><UButton label="查看" color="neutral" variant="link" @click="open(row.original)" /></template>
    </AdminDataTable><UPagination v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" /></section>
    <USlideover v-model:open="panelOpen" :title="selected ? `${selected.mapName} · ${selected.difficulty}` : ''"><template #body><section v-if="selected" class="admin-detail review-detail"><h2>{{ selected.mapName }} · {{ selected.difficulty }}</h2><p class="admin-detail__meta">{{ selected.playerName }} · {{ formatStatus(selected.status) }}</p><img class="evidence" :src="`/api/admin/evidence/${selected.submissionId}`" alt="玩家提交的挑战截图" /><section v-if="ocrPayload" class="ocr-summary" aria-label="OCR 识别结果"><h3>识别结果</h3><dl><div v-for="[name, field] in ocrFields" :key="name"><dt>{{ ocrLabels[name] }}</dt><dd>{{ ocrValue(field.value ?? ocrPayload.data?.[name]) }} <small>{{ ocrConfidence(field.confidence) }} · {{ field.status ?? 'unknown' }}</small></dd></div></dl><p v-if="Array.isArray(ocrPayload.warnings) && ocrPayload.warnings.length" class="ocr-warnings">告警：{{ ocrPayload.warnings.join('、') }}</p><p class="ocr-meta">模型 {{ ocrPayload.model_version ?? '未知' }} · 请求 {{ ocrPayload.request_id ?? '未知' }}</p><details><summary>查看原始 OCR 响应</summary><pre class="ocr">{{ JSON.stringify(ocrPayload, null, 2) }}</pre></details></section><div v-if="!isDecisionComplete(selected.status)" class="actions"><UButton label="通过" @click="review('approved')" /><UButton label="要求重传" color="neutral" variant="outline" @click="review('resubmission_required')" /><UButton label="驳回" color="error" @click="review('rejected')" /></div></section></template></USlideover>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color:var(--quiet); font-size:.78rem; }.pagination { display:flex; justify-content:center; margin-top:16px; }.evidence { display:block; width:100%; margin:22px 0; border:1px solid var(--line); border-radius:10px; }.ocr-summary { margin:22px 0; padding:16px; border:1px solid var(--line); border-radius:10px; }.ocr-summary h3 { margin:0 0 12px; font-size:.95rem; }.ocr-summary dl { margin:0; }.ocr-summary dl div { display:flex; justify-content:space-between; gap:16px; padding:8px 0; border-top:1px solid var(--line); }.ocr-summary dt { color:var(--quiet); }.ocr-summary dd { margin:0; text-align:right; }.ocr-summary small { display:block; color:var(--quiet); font-size:.72rem; }.ocr-warnings, .ocr-meta { margin:12px 0 0; color:var(--muted); font-size:.78rem; overflow-wrap:anywhere; }.ocr-summary details { margin-top:14px; }.ocr { max-height:240px; overflow:auto; padding:12px; color:var(--muted); background:var(--surface); font-size:.72rem; white-space:pre-wrap; }.actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
</style>
