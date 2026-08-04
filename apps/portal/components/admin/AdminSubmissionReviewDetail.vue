<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";
import { mapVariantLabel } from "~/utils/map-variant";

type ReviewDecision = "approved" | "rejected" | "resubmission_required";
type SpotCheckDecision = "confirmed" | "revoked";

const props = defineProps<{
  submission: AdminSubmission;
  evidenceSrc: string;
  evidenceError?: boolean;
  reviewError?: string;
  actionLoading?: boolean;
  challengeSelectionError?: string;
  challengeSelectionLoading?: boolean;
  ocrRetryError?: string;
  ocrRetryLoading?: boolean;
}>();
const emit = defineEmits<{
  review: [decision: ReviewDecision];
  "select-challenge": [selection: { challengeId: string; mapId?: string }];
  "spot-check": [decision: SpotCheckDecision];
  "evidence-error": [];
  "retry-ocr": [];
}>();

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const actionsLoading = computed(() => Boolean(props.actionLoading || props.challengeSelectionLoading || props.ocrRetryLoading));

/** Which decision button is in-flight — loading only on that control for direct feedback. */
const pendingDecision = ref<ReviewDecision | null>(null);
const pendingSpotCheck = ref<SpotCheckDecision | null>(null);

watch(
  () => props.actionLoading,
  (loading) => {
    if (!loading) { pendingDecision.value = null; pendingSpotCheck.value = null; }
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

function emitSpotCheck(decision: SpotCheckDecision) {
  if (actionsLoading.value) return;
  pendingSpotCheck.value = decision;
  emit("spot-check", decision);
}

function spotCheckLoading(decision: SpotCheckDecision) {
  return Boolean(props.actionLoading && pendingSpotCheck.value === decision);
}
</script>

<template>
  <section class="review-detail" aria-live="polite" aria-label="审核详情">
    <header class="detail-meta-bar">
      <p class="detail-meta">
        <NuxtLink class="detail-meta__player" :to="`/admin/players/${encodeURIComponent(submission.playerAccountId)}`">{{ submission.playerName }}</NuxtLink>
        <span class="detail-meta__sep" aria-hidden="true">·</span>
        <span class="detail-meta__label">截图审核</span>
      </p>
      <StatusBadge :label="formatStatus(submission.status)" :tone="submissionStatusTone(submission.status)" />
    </header>

    <UAlert v-if="reviewError" color="error" variant="subtle" :description="reviewError" role="alert" />

    <div class="detail-grid">
      <div class="evidence-col">
        <UCard class="evidence-card elevation-3">
          <template #header><div class="card-heading"><h3>提交截图</h3><span>私有证据</span></div></template>
          <img v-if="!evidenceError" class="evidence-image" :src="evidenceSrc" alt="玩家提交的挑战截图" @error="emit('evidence-error')" />
          <p v-else class="evidence-message" role="status">暂无截图。</p>
        </UCard>
      </div>

      <div class="info-col">
        <section class="actions-card glass elevation-2" aria-labelledby="review-actions-title">
          <header class="actions-card__header">
            <h3 id="review-actions-title">审核操作</h3>
            <span v-if="actionLoading" class="action-status" role="status">提交中…</span>
          </header>

          <div class="actions" role="group" aria-label="审核决定" :aria-busy="actionLoading || undefined">
            <UButton
              class="action-btn action-btn--primary pressable"
              type="button"
              icon="i-lucide-check"
              label="通过"
              :loading="decisionLoading('approved')"
              :disabled="actionsLoading"
              @click="emitReview('approved')"
            />
            <UButton
              class="action-btn pressable"
              type="button"
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
              label="驳回"
              color="error"
              variant="soft"
              :loading="decisionLoading('rejected')"
              :disabled="actionsLoading"
              @click="emitReview('rejected')"
            />
          </div>

          <div v-if="submission.spotCheck?.status === 'pending'" class="spot-check-panel" aria-labelledby="spot-check-title">
            <div><h4 id="spot-check-title">自动判定抽检</h4><p>请核对截图与称号结果。抽检不影响自动结果，发现错误时可撤销称号。</p></div>
            <div class="spot-check-actions">
              <UButton class="action-btn pressable" type="button" block label="确认抽检" color="neutral" variant="outline" :loading="spotCheckLoading('confirmed')" :disabled="actionsLoading" @click="emitSpotCheck('confirmed')" />
              <UButton class="action-btn pressable" type="button" block label="撤销称号" color="error" variant="soft" :loading="spotCheckLoading('revoked')" :disabled="actionsLoading" @click="emitSpotCheck('revoked')" />
            </div>
          </div>

          <div class="ocr-retry-actions" :aria-busy="ocrRetryLoading || undefined">
            <p v-if="ocrRetryError" class="ocr-retry-error" role="alert">{{ ocrRetryError }}</p>
            <UButton
              class="action-btn action-btn--utility pressable"
              type="button"
              icon="i-lucide-refresh-cw"
              label="重新发送 OCRKit 请求"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="ocrRetryLoading"
              :disabled="actionsLoading"
              @click="emit('retry-ocr')"
            />
          </div>
        </section>

        <UCard class="overview-card elevation-2">
          <template #header><div class="card-heading"><h3>提交概览</h3><StatusBadge :label="formatStatus(submission.status)" :tone="submissionStatusTone(submission.status)" /></div></template>
          <dl class="detail-list">
            <div><dt>提交编号</dt><dd>{{ submission.submissionId }}</dd></div>
            <div><dt>玩家</dt><dd><NuxtLink class="player-link" :to="`/admin/players/${encodeURIComponent(submission.playerAccountId)}`">{{ submission.playerName }}</NuxtLink></dd></div>
            <div><dt>提交时间</dt><dd>{{ formatTime(submission.createdAt) }}</dd></div>
            <div><dt>最后更新</dt><dd>{{ formatTime(submission.updatedAt) }}</dd></div>
          </dl>
        </UCard>

        <UCard v-if="submission.challenge" class="challenge-card elevation-2">
          <template #header><div class="card-heading"><h3>申请挑战</h3></div></template>
          <dl class="detail-list">
            <template v-if="submission.challenge.family === 'achievement'">
              <div><dt>类型</dt><dd>称号挑战</dd></div>
              <div><dt>称号</dt><dd>{{ submission.challenge.titleName }}</dd></div>
              <div v-if="submission.challenge.mapVariant === 'classic'"><dt>地图版本</dt><dd>{{ mapVariantLabel(submission.challenge.mapVariant) }}</dd></div>
              <div><dt>系列</dt><dd>{{ submission.challenge.category }}</dd></div>
              <div><dt>完成条件</dt><dd>{{ submission.challenge.condition }}</dd></div>
              <div><dt>截图规则</dt><dd>{{ submission.challenge.evidenceRule }}</dd></div>
            </template>
            <template v-else>
              <div><dt>类型</dt><dd>地图挑战</dd></div>
              <div><dt>挑战</dt><dd>{{ submission.challenge.name }}</dd></div>
              <div><dt>地图</dt><dd>{{ submission.challenge.mapName }}</dd></div>
              <div><dt>地图版本</dt><dd>{{ mapVariantLabel(submission.challenge.mapVariant) }}</dd></div>
              <div><dt>难度</dt><dd>{{ submission.challenge.difficulty ?? "地图通关" }}</dd></div>
            </template>
          </dl>
        </UCard>

      </div>
    </div>

    <AdminSubmissionReviewSignals :submission="submission" :challenge-selection-error="challengeSelectionError" :challenge-selection-loading="challengeSelectionLoading" @select-challenge="emit('select-challenge', $event)" />
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
  text-decoration: none;
}
.detail-meta__player:hover, .detail-meta__player:focus-visible {
  color: var(--accent);
  text-decoration: underline;
}
.player-link { color: var(--accent); font-weight: 650; text-decoration: none; }
.player-link:hover, .player-link:focus-visible { text-decoration: underline; }
.detail-meta__sep { color: var(--quiet); }
.detail-meta__label { color: var(--quiet); }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, .9fr); align-items: start; gap: clamp(18px, 2.4vw, 28px); }
.evidence-col { position: sticky; top: 24px; min-width: 0; }
.info-col { display: grid; gap: 16px; min-width: 0; }
.overview-card,
.challenge-card,
.evidence-card { border-color: var(--line); }
.evidence-image { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; }
.evidence-message { margin: 0; padding: 96px 0; color: var(--muted); text-align: center; }

/* Review decision chrome — compact material layer (Apple materials hierarchy) */
.actions-card {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in oklch, var(--line) 88%, transparent);
  border-radius: 14px;
  /* bright top edge = light catching the material */
  box-shadow:
    var(--elevation-2),
    inset 0 1px 0 color-mix(in oklch, white 28%, transparent);
}
.actions-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.actions-card__header h3 {
  margin: 0;
  font-size: .9rem;
  font-weight: 720;
  letter-spacing: -.02em;
  color: var(--text-on-glass);
}
.actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.actions :deep(.action-btn) {
  min-height: 36px;
  padding-inline: 6px;
  font-size: .82rem;
  font-weight: 680;
  letter-spacing: -.01em;
}
.actions :deep(.action-btn--primary) {
  min-height: 36px;
  font-weight: 700;
}
.ocr-retry-actions {
  display: grid;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
}
.ocr-retry-actions :deep(.action-btn) {
  justify-self: start;
  min-height: 28px;
  padding-inline: 8px;
  font-size: .76rem;
  font-weight: 650;
}
.ocr-retry-error { margin: 0; color: var(--danger); font-size: .78rem; }
.action-status {
  flex: 0 0 auto;
  color: var(--text-on-glass-quiet);
  font-size: .72rem;
  font-weight: 650;
  white-space: nowrap;
}

.spot-check-panel { display:grid; gap:10px; padding-top:12px; border-top:1px solid color-mix(in oklch, var(--line) 80%, transparent); }
.spot-check-panel h4 { margin:0; font-size:.82rem; }
.spot-check-panel p { margin:4px 0 0; color:var(--text-on-glass-quiet); font-size:.75rem; line-height:1.5; }
.spot-check-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
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
  /*
   * Bottom dock: decisions stay in thumb reach while scrolling tall evidence.
   * Fixed (not sticky-bottom) so the bar remains available after leaving its
   * natural flow position at the top of the info column.
   */
  .review-detail {
    padding-bottom: calc(240px + env(safe-area-inset-bottom, 0px));
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
  .actions :deep(.action-btn) {
    min-height: 44px;
    font-size: .84rem;
  }
  .spot-check-actions { grid-template-columns: 1fr 1fr; }
}

@media (prefers-reduced-transparency: reduce) {
  .overview-card,
  .challenge-card,
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
