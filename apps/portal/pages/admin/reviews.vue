<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";
import type { AdminSubmission } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "审核管理 · 躲避堡垒 3" });
const api = useAdminApi();
const submissions = ref<AdminSubmission[]>([]);
const selected = ref<AdminSubmission | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const reviewError = shallowRef("");
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
const submissionTarget = (submission: AdminSubmission) => submission.challenge?.family === "achievement" ? submission.challenge.titleName : `${submission.mapName}${submission.difficulty ? ` · ${submission.difficulty}` : ""}`;
const ocrStatusText: Record<AdminSubmission["ocrStatus"], string> = { not_started: "未开始", pending: "识别中", matched: "已匹配", mismatch: "未匹配", review_required: "需人工核对", error: "识别失败" };
const ocrStatusTone = (status: AdminSubmission["ocrStatus"]) => status === "matched" ? "success" : status === "mismatch" || status === "review_required" || status === "error" ? "warning" : "default";
const columns = [
  { accessorKey: "challenge", header: "挑战" },
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "ocrStatus", header: "OCRKit" },
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
  catch (error) { errorMessage.value = portalErrorDetails(error, "无法读取待核对截图，请确认当前账号有管理员权限。").description; }
  finally { loading.value = false; }
}
async function open(submission: AdminSubmission) { reviewError.value = ""; try { selected.value = await api<AdminSubmission>(`/v1/submissions/${submission.submissionId}`); } catch (error) { reviewError.value = portalErrorDetails(error, "无法读取提交详情，请稍后重试。").description; } }
async function review(decision: "approved" | "rejected" | "resubmission_required") {
  if (!selected.value) return;
  reviewError.value = "";
  const submissionId = selected.value.submissionId;
  try {
    await api(`/v1/submissions/${submissionId}/review`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", decision } });
    const toast = useToast();
    toast.add({ title: decision === "approved" ? "审核已批准" : decision === "rejected" ? "审核已拒绝" : "已要求重新提交", color: "success" });
    close(); await load();
  } catch (error) {
    const details = portalErrorDetails(error, "审核提交失败，请查看服务端日志。");
    reviewError.value = details.code ? `审核提交失败（${details.code}）：${details.description}` : details.description;
  }
}
function close() { selected.value = null; }
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="审核管理" :count="loading ? '读取中…' : `${total} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="提交记录"><AdminDataTable :data="submissions" :columns="columns" :loading="loading" empty="暂无提交记录。" table-key="reviews" :reset-scroll-key="page" class="admin-table">
      <template #challenge-cell="{ row }"><strong>{{ submissionTarget(row.original) }}</strong><small v-if="row.original.challenge?.family === 'achievement'" class="table-meta">{{ row.original.challenge.condition }}</small></template>
      <template #playerName-cell="{ row }"><span>{{ row.original.playerName }}</span></template>
      <template #status-cell="{ row }"><StatusBadge :label="formatStatus(row.original.status)" :tone="statusTone(row.original.status)" /></template>
      <template #ocrStatus-cell="{ row }"><StatusBadge :label="ocrStatusText[row.original.ocrStatus]" :tone="ocrStatusTone(row.original.ocrStatus)" /></template>
      <template #updatedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.updatedAt) }}</span></template>
      <template #actions-cell="{ row }"><UButton label="查看" color="neutral" variant="link" @click="open(row.original)" /></template>
    </AdminDataTable><UPagination v-model:page="page" :total="total" :items-per-page="20" class="pagination" @update:page="load" /></section>
    <AdminResponsiveDialog v-model:open="panelOpen" :title="selected ? submissionTarget(selected) : ''" size="lg"><template #body><section v-if="selected" class="admin-detail review-detail"><h2>{{ submissionTarget(selected) }}</h2><p class="admin-detail__meta">{{ selected.playerName }} · {{ formatStatus(selected.status) }}</p><UAlert v-if="reviewError" color="error" variant="subtle" :description="reviewError" /><section v-if="selected.challenge" class="challenge-summary" aria-label="申请挑战"><h3>申请挑战</h3><dl v-if="selected.challenge.family === 'achievement'"><div><dt>类型</dt><dd>称号挑战</dd></div><div><dt>称号</dt><dd>{{ selected.challenge.titleName }}</dd></div><div><dt>系列</dt><dd>{{ selected.challenge.category }}</dd></div><div><dt>完成条件</dt><dd>{{ selected.challenge.condition }}</dd></div><div><dt>截图规则</dt><dd>{{ selected.challenge.evidenceRule }}</dd></div></dl><dl v-else><div><dt>类型</dt><dd>地图挑战</dd></div><div><dt>挑战</dt><dd>{{ selected.challenge.name }}</dd></div><div><dt>地图</dt><dd>{{ selected.challenge.mapName }}</dd></div><div><dt>难度</dt><dd>{{ selected.challenge.difficulty ?? '地图通关' }}</dd></div></dl></section><img class="evidence" :src="`/api/admin/evidence/${selected.submissionId}`" alt="玩家提交的挑战截图" /><section class="ocr-summary" aria-label="OCRKit 信息"><h3>OCRKit</h3><dl><div><dt>状态</dt><dd><StatusBadge :label="ocrStatusText[selected.ocrStatus]" :tone="ocrStatusTone(selected.ocrStatus)" /></dd></div><div><dt>处理尝试</dt><dd>{{ selected.ocrAttempt ?? '暂无记录' }}</dd></div><div v-if="selected.ocrErrorCode"><dt>错误代码</dt><dd>{{ selected.ocrErrorCode }}</dd></div></dl><template v-if="ocrPayload"><h3 class="ocr-result-title">识别结果</h3><dl><div v-for="[name, field] in ocrFields" :key="name"><dt>{{ ocrLabels[name] }}</dt><dd>{{ ocrValue(field.value ?? ocrPayload.data?.[name]) }} <small>{{ ocrConfidence(field.confidence) }} · {{ field.status ?? 'unknown' }}</small></dd></div></dl><p v-if="Array.isArray(ocrPayload.warnings) && ocrPayload.warnings.length" class="ocr-warnings">告警：{{ ocrPayload.warnings.join('、') }}</p><p class="ocr-meta">模型 {{ ocrPayload.model_version ?? '未知' }} · 请求 {{ ocrPayload.request_id ?? '未知' }}</p><details><summary>查看原始 OCR 响应</summary><pre class="ocr">{{ JSON.stringify(ocrPayload, null, 2) }}</pre></details></template></section><div v-if="!isDecisionComplete(selected.status)" class="actions"><UButton label="通过" @click="review('approved')" /><UButton label="要求重传" color="neutral" variant="outline" @click="review('resubmission_required')" /><UButton label="驳回" color="error" @click="review('rejected')" /></div></section></template></AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { display:block; color:var(--quiet); font-size:.78rem; }.pagination { display:flex; justify-content:center; margin-top:16px; }.challenge-summary, .ocr-summary { margin:22px 0; padding:16px; border:1px solid var(--line); border-radius:10px; }.challenge-summary h3, .ocr-summary h3 { margin:0 0 12px; font-size:.95rem; }.challenge-summary dl, .ocr-summary dl { margin:0; }.challenge-summary dl div, .ocr-summary dl div { display:flex; justify-content:space-between; gap:16px; padding:8px 0; border-top:1px solid var(--line); }.challenge-summary dt, .ocr-summary dt { color:var(--quiet); }.challenge-summary dd, .ocr-summary dd { margin:0; text-align:right; overflow-wrap:anywhere; }.evidence { display:block; width:100%; margin:22px 0; border:1px solid var(--line); border-radius:10px; }.ocr-result-title { margin-top:22px !important; }.ocr-summary small { display:block; color:var(--quiet); font-size:.72rem; }.ocr-warnings, .ocr-meta { margin:12px 0 0; color:var(--muted); font-size:.78rem; overflow-wrap:anywhere; }.ocr-summary details { margin-top:14px; }.ocr { max-height:240px; overflow:auto; padding:12px; color:var(--muted); background:var(--surface); font-size:.72rem; white-space:pre-wrap; }.actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
</style>
