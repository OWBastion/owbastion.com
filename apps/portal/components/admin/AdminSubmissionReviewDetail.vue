<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { submissionStatusText } from "~/utils/submissionStatus";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";

type OcrField = { value?: unknown; confidence?: unknown; status?: unknown };
type OcrPayload = { data?: Record<string, unknown>; fields?: Record<string, OcrField>; warnings?: unknown; model_version?: unknown; request_id?: unknown };

type ReviewDecision = "approved" | "rejected" | "resubmission_required";

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
  review: [decision: ReviewDecision];
  "evidence-error": [];
  "retry-ocr": [];
}>();

const ocrLabels: Record<string, string> = { map_name: "地图", map_variant: "地图版本", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记" };
const ocrPayload = computed(() => props.submission.ocr as OcrPayload | null);
const ocrFields = computed(() => Object.entries(ocrPayload.value?.fields ?? {}).filter(([name]) => name in ocrLabels));
const ocrValue = (value: unknown) => value === null || value === undefined ? "未识别" : value === true ? "已识别完成" : value === false ? "未识别完成" : String(value);
const ocrConfidence = (value: unknown) => typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const statusTone = (status: string) => status === "ready_for_review" ? "success" : status === "ocr_review_required" ? "warning" : "default";
const actionsLoading = computed(() => Boolean(props.actionLoading || props.ocrRetryLoading));

/** Which decision button is in-flight — loading only on that control for direct feedback. */
const pendingDecision = ref<ReviewDecision | null>(null);

watch(
  () => props.actionLoading,
  (loading) => {
    if (!loading) pendingDecision.value = null;
  },
);

function emitReview(decision: ReviewDecision) {
  if (actionsLoading.value) return;
  pendingDecision.value = decision;
  emit("review", decision);
}

function decisionLoading(decision: ReviewDecision) {
  return Boolean(props.actionLoading && pendingDecision.value === decision);
}
</script>

<template>
  <section class="review-detail" aria-live="polite" aria-label="审核详情">
    <header class="detail-meta-bar">
      <p class="detail-meta">
        <span class="detail-meta__player">{{ submission.playerName }}</span>
        <span class="detail-meta__sep" aria-hidden="true">·</span>
        <span class="detail-meta__label">截图审核</span>
      </p>
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
        <section class="actions-card glass elevation-2" aria-labelledby="review-actions-title">
          <header class="actions-card__header">
            <div class="actions-card__heading">
              <h3 id="review-actions-title">审核操作</h3>
              <p class="actions-card__subtitle glass-text-quiet">决定结果</p>
            </div>
            <span v-if="actionLoading" class="action-status" role="status">提交中…</span>
          </header>

          <div class="actions" role="group" aria-label="审核决定" :aria-busy="actionLoading || undefined">
            <UButton
              class="action-btn action-btn--primary pressable"
              type="button"
              block
              size="lg"
              icon="i-lucide-check"
              label="通过"
              :loading="decisionLoading('approved')"
              :disabled="actionsLoading"
              @click="emitReview('approved')"
            />
            <div class="actions-secondary">
              <UButton
                class="action-btn pressable"
                type="button"
                block
                icon="i-lucide-rotate-cw"
                label="要求重传"
                color="neutral"
                variant="outline"
                :loading="decisionLoading('resubmission_required')"
                :disabled="actionsLoading"
                @click="emitReview('resubmission_required')"
              />
              <UButton
                class="action-btn pressable"
                type="button"
                block
                icon="i-lucide-x"
                label="驳回"
                color="error"
                variant="soft"
                :loading="decisionLoading('rejected')"
                :disabled="actionsLoading"
                @click="emitReview('rejected')"
              />
            </div>
          </div>

          <div class="ocr-retry-actions" :aria-busy="ocrRetryLoading || undefined">
            <p v-if="ocrRetryError" class="ocr-retry-error" role="alert">{{ ocrRetryError }}</p>
            <UButton
              class="action-btn action-btn--utility pressable"
              type="button"
              block
              icon="i-lucide-refresh-cw"
              label="重新发送 OCRKit 请求"
              color="neutral"
              variant="ghost"
              :loading="ocrRetryLoading"
              :disabled="actionsLoading"
              @click="emit('retry-ocr')"
            />
            <span v-if="ocrRetryLoading" class="action-status" role="status">发送中…</span>
          </div>
        </section>

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
              <div v-if="submission.challenge.mapVariant === 'classic'"><dt>地图版本</dt><dd>经典版</dd></div>
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
            <div><dt>状态</dt><dd><StatusBadge :label="ocrStatusLabel(submission.ocrStatus)" :tone="ocrStatusTone(submission.ocrStatus)" /></dd></div>
            <div><dt>处理尝试</dt><dd>{{ submission.ocrAttempt ?? "暂无记录" }}</dd></div>
            <div v-if="submission.ocrErrorCode"><dt>错误代码</dt><dd>{{ submission.ocrErrorCode }}</dd></div>
          </dl>
          <template v-if="ocrPayload">
            <h4>识别结果</h4>
            <dl class="detail-list">
              <div v-for="[name, field] in ocrFields" :key="name"><dt>{{ ocrLabels[name] }}</dt><dd>{{ ocrValue(field.value ?? ocrPayload.data?.[name]) }} <small>{{ ocrConfidence(field.confidence) }} · {{ field.status ?? "unknown" }}</small></dd></div>
              <div v-if="ocrPayload.data?.map_variant !== undefined && !ocrFields.some(([name]) => name === 'map_variant')"><dt>地图版本</dt><dd>{{ ocrValue(ocrPayload.data.map_variant) }} <small>OCR 数据</small></dd></div>
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
.review-detail { display: grid; gap: 20px; }
/* Compact identity strip — page h1 lives in AdminWorkspace */
.detail-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
  margin: 0;
  min-width: 0;
  color: var(--quiet);
  font-size: .84rem;
  line-height: 1.35;
}
.detail-meta__player {
  color: var(--text);
  font-weight: 650;
  overflow-wrap: anywhere;
}
.detail-meta__sep { color: var(--quiet); }
.detail-meta__label { color: var(--quiet); }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, .9fr); align-items: start; gap: clamp(18px, 2.4vw, 28px); }
.evidence-col { position: sticky; top: 24px; min-width: 0; }
.info-col { display: grid; gap: 16px; min-width: 0; }
.overview-card,
.challenge-card,
.ocr-card,
.evidence-card { border-color: var(--line); }
.overview-card,
.challenge-card,
.ocr-card { box-shadow: var(--elevation-2); }
.evidence-card { box-shadow: var(--elevation-3); }
.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.card-heading h3 { margin: 0; font-size: 1rem; font-weight: 720; letter-spacing: -.02em; }
.card-heading > span { color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .04em; }
.detail-list { display: grid; gap: 0; margin: 0; }
.detail-list div { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.detail-list div:first-child { padding-top: 0; }
.detail-list div:last-child { padding-bottom: 0; border-bottom: 0; }
dt { color: var(--quiet); font-size: .8rem; }
dd { min-width: 0; margin: 0; font-size: .88rem; font-weight: 650; text-align: right; overflow-wrap: anywhere; }
.evidence-image { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; }
.evidence-message { margin: 0; padding: 96px 0; color: var(--muted); text-align: center; }

/* Review decision chrome — interactive material layer (Apple materials hierarchy) */
.actions-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid color-mix(in oklch, var(--line) 88%, transparent);
  border-radius: 16px;
  /* bright top edge = light catching the material */
  box-shadow:
    var(--elevation-2),
    inset 0 1px 0 color-mix(in oklch, white 28%, transparent);
}
.actions-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.actions-card__heading { min-width: 0; }
.actions-card__heading h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 720;
  letter-spacing: -.02em;
  color: var(--text-on-glass);
}
.actions-card__subtitle {
  margin: 4px 0 0;
  font-size: .72rem;
  font-weight: 650;
  letter-spacing: .01em;
  line-height: 1.35;
}
.actions {
  display: grid;
  gap: 10px;
}
.actions-secondary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.actions :deep(.action-btn),
.ocr-retry-actions :deep(.action-btn) {
  min-height: 44px;
  font-weight: 680;
  letter-spacing: -.01em;
}
.actions :deep(.action-btn--primary) {
  min-height: 48px;
  font-size: .95rem;
  font-weight: 700;
}
.ocr-retry-actions {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
}
.ocr-retry-error { margin: 0; color: var(--danger); font-size: .78rem; }
.action-status {
  flex: 0 0 auto;
  color: var(--text-on-glass-quiet);
  font-size: .72rem;
  font-weight: 650;
  white-space: nowrap;
}

.ocr-card h4 { margin: 22px 0 12px; font-size: .9rem; }
.detail-list small { display: block; color: var(--quiet); font-size: .72rem; }
.ocr-meta { margin: 12px 0 0; color: var(--muted); font-size: .78rem; overflow-wrap: anywhere; }
.ocr-card details { margin-top: 14px; }
.ocr-card pre {
  max-height: 280px;
  overflow: auto;
  margin: 10px 0 0;
  padding: 12px;
  color: var(--muted);
  background: var(--surface);
  font-size: .72rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 820px) {
  .detail-grid { grid-template-columns: 1fr; }
  .evidence-col { position: static; }
  /* Stick decision chrome under the header once it reaches the viewport */
  .actions-card {
    position: sticky;
    z-index: 4;
    top: 12px;
  }
}

@media (max-width: 620px) {
  .detail-meta-bar { align-items: flex-start; }
  .detail-list div { align-items: flex-start; flex-direction: column; gap: 6px; }
  .detail-list dd { text-align: left; }
  /*
   * Bottom dock: decisions stay in thumb reach while scrolling tall evidence.
   * Fixed (not sticky-bottom) so the bar remains available after leaving its
   * natural flow position at the top of the info column.
   */
  .review-detail {
    padding-bottom: calc(220px + env(safe-area-inset-bottom, 0px));
  }
  .actions-card {
    position: fixed;
    top: auto;
    right: max(12px, env(safe-area-inset-right, 0px));
    bottom: max(10px, env(safe-area-inset-bottom, 0px));
    left: max(12px, env(safe-area-inset-left, 0px));
    z-index: 30;
    margin-inline: 0;
    border-radius: 18px;
    box-shadow:
      var(--elevation-3),
      inset 0 1px 0 color-mix(in oklch, white 28%, transparent);
  }
  .actions-secondary { grid-template-columns: 1fr 1fr; gap: 8px; }
}

@media (prefers-reduced-transparency: reduce) {
  .overview-card,
  .challenge-card,
  .ocr-card,
  .actions-card,
  .evidence-card { box-shadow: none; }
  .actions-card {
    background: var(--glass-bg-solid-raised);
    border-color: var(--line-strong);
  }
}

@media (prefers-contrast: more) {
  .overview-card,
  .challenge-card,
  .ocr-card,
  .actions-card,
  .evidence-card { border-color: var(--text); }
}

@media (prefers-reduced-motion: reduce) {
  .actions-card {
    /* Keep material; suppress any residual spatial chrome motion */
    transition: background-color var(--theme-transition), border-color var(--theme-transition), color var(--theme-transition);
  }
}
</style>
