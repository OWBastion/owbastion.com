<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { submissionStatusText } from "~/utils/submissionStatus";

type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };

const props = defineProps<{
  submission: AdminSubmission;
  evidenceSrc: string;
  evidenceError?: boolean;
  reviewError?: string;
  actionLoading?: boolean;
  ocrRetryError?: string;
  ocrRetryLoading?: boolean;
}>();
const emit = defineEmits<{
  review: [decision: "approved" | "rejected" | "resubmission_required"];
  "evidence-error": [];
  "retry-ocr": [];
}>();

const ocrLabels: Record<string, string> = { map_name: "地图", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记" };
const ocrPayload = computed(() => props.submission.ocr as OcrPayload | null);
const ocrFields = computed(() => Object.entries(ocrPayload.value?.fields ?? {}).filter(([name]) => name in ocrLabels));
const ocrValue = (value: unknown) => value === null || value === undefined ? "未识别" : value === true ? "已识别完成" : value === false ? "未识别完成" : String(value);
const ocrConfidence = (value: unknown) => typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const submissionTarget = computed(() => props.submission.challenge?.family === "achievement" ? props.submission.challenge.titleName : `${props.submission.mapName}${props.submission.difficulty ? ` · ${props.submission.difficulty}` : ""}`);
const statusTone = (status: string) => status === "ready_for_review" ? "success" : status === "ocr_review_required" ? "warning" : "default";
const ocrStatusText: Record<AdminSubmission["ocrStatus"], string> = { not_started: "未开始", pending: "识别中", matched: "已匹配", mismatch: "未匹配", review_required: "需人工核对", error: "识别失败" };
const ocrStatusTone = (status: AdminSubmission["ocrStatus"]) => status === "matched" ? "success" : status === "mismatch" || status === "review_required" || status === "error" ? "warning" : "default";
const actionsLoading = computed(() => Boolean(props.actionLoading || props.ocrRetryLoading));
</script>

<template>
  <section class="review-detail" aria-live="polite">
    <header class="detail-heading">
      <div>
        <p class="eyebrow">截图审核</p>
        <h2>{{ submissionTarget }}</h2>
        <p class="detail-meta">{{ submission.playerName }} · {{ formatStatus(submission.status) }}</p>
      </div>
      <StatusBadge :label="formatStatus(submission.status)" :tone="statusTone(submission.status)" />
    </header>

    <UAlert v-if="reviewError" color="error" variant="subtle" :description="reviewError" role="alert" />

    <div class="detail-grid">
      <div class="evidence-col">
        <UCard class="evidence-card">
          <template #header><div class="card-heading"><h3>提交截图</h3><span>私有证据</span></div></template>
          <img v-if="!evidenceError" class="evidence-image" :src="evidenceSrc" alt="玩家提交的挑战截图" @error="emit('evidence-error')" />
          <p v-else class="evidence-message" role="status">暂无截图。</p>
        </UCard>
      </div>

      <div class="info-col">
        <UCard class="actions-card">
          <template #header><div class="card-heading"><h3>审核操作</h3><span>请选择处理结果</span></div></template>
          <div class="actions">
            <UButton label="通过" :loading="actionLoading" :disabled="actionsLoading" @click="emit('review', 'approved')" />
            <UButton label="要求重传" color="neutral" variant="outline" :loading="actionLoading" :disabled="actionsLoading" @click="emit('review', 'resubmission_required')" />
            <UButton label="驳回" color="error" :loading="actionLoading" :disabled="actionsLoading" @click="emit('review', 'rejected')" />
          </div>
          <div class="ocr-retry-actions">
            <p v-if="ocrRetryError" class="ocr-retry-error" role="alert">{{ ocrRetryError }}</p>
            <UButton label="重新发送 OCRKit 请求" color="neutral" variant="outline" :loading="ocrRetryLoading" :disabled="actionsLoading" @click="emit('retry-ocr')" />
          </div>
        </UCard>

        <UCard class="overview-card">
          <template #header><div class="card-heading"><h3>提交概览</h3><StatusBadge :label="formatStatus(submission.status)" :tone="statusTone(submission.status)" /></div></template>
          <dl class="detail-list">
            <div><dt>提交编号</dt><dd>{{ submission.submissionId }}</dd></div>
            <div><dt>玩家</dt><dd>{{ submission.playerName }}</dd></div>
            <div><dt>提交时间</dt><dd>{{ formatTime(submission.createdAt) }}</dd></div>
            <div><dt>最后更新</dt><dd>{{ formatTime(submission.updatedAt) }}</dd></div>
          </dl>
        </UCard>

        <UCard v-if="submission.challenge" class="challenge-card">
          <template #header><div class="card-heading"><h3>申请挑战</h3></div></template>
          <dl class="detail-list">
            <template v-if="submission.challenge.family === 'achievement'">
              <div><dt>类型</dt><dd>称号挑战</dd></div>
              <div><dt>称号</dt><dd>{{ submission.challenge.titleName }}</dd></div>
              <div><dt>系列</dt><dd>{{ submission.challenge.category }}</dd></div>
              <div><dt>完成条件</dt><dd>{{ submission.challenge.condition }}</dd></div>
              <div><dt>截图规则</dt><dd>{{ submission.challenge.evidenceRule }}</dd></div>
            </template>
            <template v-else>
              <div><dt>类型</dt><dd>地图挑战</dd></div>
              <div><dt>挑战</dt><dd>{{ submission.challenge.name }}</dd></div>
              <div><dt>地图</dt><dd>{{ submission.challenge.mapName }}</dd></div>
              <div><dt>难度</dt><dd>{{ submission.challenge.difficulty ?? "地图通关" }}</dd></div>
            </template>
          </dl>
        </UCard>

        <UCard class="ocr-card">
          <template #header><div class="card-heading"><h3>OCRKit</h3><span>识别证据</span></div></template>
          <dl class="detail-list">
            <div><dt>状态</dt><dd><StatusBadge :label="ocrStatusText[submission.ocrStatus]" :tone="ocrStatusTone(submission.ocrStatus)" /></dd></div>
            <div><dt>处理尝试</dt><dd>{{ submission.ocrAttempt ?? "暂无记录" }}</dd></div>
            <div v-if="submission.ocrErrorCode"><dt>错误代码</dt><dd>{{ submission.ocrErrorCode }}</dd></div>
          </dl>
          <template v-if="ocrPayload">
            <h4>识别结果</h4>
            <dl class="detail-list">
              <div v-for="[name, field] in ocrFields" :key="name"><dt>{{ ocrLabels[name] }}</dt><dd>{{ ocrValue(field.value ?? ocrPayload.data?.[name]) }} <small>{{ ocrConfidence(field.confidence) }} · {{ field.status ?? "unknown" }}</small></dd></div>
            </dl>
            <p v-if="Array.isArray(ocrPayload.warnings) && ocrPayload.warnings.length" class="ocr-meta">告警：{{ ocrPayload.warnings.join("、") }}</p>
            <p class="ocr-meta">模型 {{ ocrPayload.model_version ?? "未知" }} · 请求 {{ ocrPayload.request_id ?? "未知" }}</p>
            <details><summary>查看原始 OCR 响应</summary><pre>{{ JSON.stringify(ocrPayload, null, 2) }}</pre></details>
          </template>
        </UCard>
      </div>
    </div>
  </section>
</template>

<style scoped>
.review-detail { display:grid; gap:24px; }.detail-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; }.detail-heading h2 { margin:0; max-width:22ch; font-size:clamp(1.8rem,4vw,2.8rem); letter-spacing:-.05em; line-height:1.05; overflow-wrap:anywhere; }.detail-heading .eyebrow { margin-bottom:8px; }.detail-meta { margin:10px 0 0; color:var(--quiet); font-size:.82rem; }.detail-grid { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(300px,.9fr); align-items:start; gap:clamp(18px,2.4vw,28px); }.evidence-col { position:sticky; top:24px; min-width:0; }.info-col { display:grid; gap:16px; min-width:0; }.overview-card,.challenge-card,.ocr-card,.actions-card,.evidence-card { border-color:var(--line); box-shadow:0 12px 32px -24px var(--shadow); }.evidence-card { box-shadow:0 18px 44px -28px var(--shadow); }.card-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; }.card-heading h3 { margin:0; font-size:1rem; font-weight:720; letter-spacing:-.02em; }.card-heading > span { color:var(--quiet); font-size:.72rem; font-weight:680; letter-spacing:.04em; }.detail-list { display:grid; gap:0; margin:0; }.detail-list div { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; padding:13px 0; border-bottom:1px solid var(--line); }.detail-list div:first-child { padding-top:0; }.detail-list div:last-child { padding-bottom:0; border-bottom:0; }dt { color:var(--quiet); font-size:.8rem; }dd { min-width:0; margin:0; font-size:.88rem; font-weight:650; text-align:right; overflow-wrap:anywhere; }.evidence-image { display:block; width:100%; height:auto; border:1px solid var(--line); border-radius:12px; }.evidence-message { margin:0; padding:96px 0; color:var(--muted); text-align:center; }.actions { display:grid; gap:8px; }.ocr-retry-actions { display:grid; gap:8px; margin-top:18px; padding-top:18px; border-top:1px solid var(--line); }.ocr-retry-error { margin:0; color:var(--error); font-size:.78rem; }.ocr-card h4 { margin:22px 0 12px; font-size:.9rem; }.detail-list small { display:block; color:var(--quiet); font-size:.72rem; }.ocr-meta { margin:12px 0 0; color:var(--muted); font-size:.78rem; overflow-wrap:anywhere; }.ocr-card details { margin-top:14px; }.ocr-card pre { max-height:280px; overflow:auto; margin:10px 0 0; padding:12px; color:var(--muted); background:var(--surface); font-size:.72rem; white-space:pre-wrap; overflow-wrap:anywhere; }
@media (max-width:820px) { .detail-grid { grid-template-columns:1fr; }.evidence-col { position:static; } }
@media (max-width:620px) { .detail-heading { align-items:flex-start; flex-direction:column; }.detail-heading h2 { max-width:none; }.detail-list div { align-items:flex-start; flex-direction:column; gap:6px; }.detail-list dd { text-align:left; } }
@media (prefers-reduced-transparency:reduce) { .overview-card,.challenge-card,.ocr-card,.actions-card,.evidence-card { box-shadow:none; } }
@media (prefers-contrast:more) { .overview-card,.challenge-card,.ocr-card,.actions-card,.evidence-card { border-color:var(--text); } }
</style>
