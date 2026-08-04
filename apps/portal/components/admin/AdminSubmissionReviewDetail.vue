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
    if (!loading) {
      pendingDecision.value = null;
      pendingSpotCheck.value = null;
    }
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

const challengeSummary = computed(() => {
  const challenge = props.submission.challenge;
  if (!challenge) return null;
  if (challenge.family === "achievement") {
    return {
      kind: "成就挑战",
      title: challenge.titleName,
      meta: [challenge.category, challenge.mapVariant === "classic" ? mapVariantLabel(challenge.mapVariant) : null].filter(Boolean).join(" · "),
      condition: challenge.condition,
      evidenceRule: challenge.evidenceRule,
    };
  }
  return {
    kind: "地图挑战",
    title: challenge.name,
    meta: [challenge.mapName, mapVariantLabel(challenge.mapVariant), challenge.difficulty ?? "地图通关"].filter(Boolean).join(" · "),
    condition: null as string | null,
    evidenceRule: null as string | null,
  };
});
</script>

<template>
  <section class="review-detail" aria-live="polite" aria-label="审核详情">
    <!-- 1. Context: who / status / when -->
    <header class="detail-meta-bar">
      <p class="detail-meta">
        <NuxtLink class="detail-meta__player" :to="`/admin/players/${encodeURIComponent(submission.playerAccountId)}`">{{ submission.playerName }}</NuxtLink>
        <span class="detail-meta__sep" aria-hidden="true">·</span>
        <span class="detail-meta__label">截图审核</span>
        <span class="detail-meta__sep" aria-hidden="true">·</span>
        <time class="detail-meta__time" :datetime="new Date(submission.updatedAt).toISOString()">{{ formatTime(submission.updatedAt) }}</time>
      </p>
      <StatusBadge :label="formatStatus(submission.status)" :tone="submissionStatusTone(submission.status)" />
    </header>

    <UAlert v-if="reviewError" color="error" variant="subtle" :description="reviewError" role="alert" />

    <!--
      Desktop: evidence | decision rail (claim → decide → verify)
      Mobile: claim → evidence → verify → meta; decisions docked for thumb reach
    -->
    <div class="detail-grid">
      <div class="evidence-col flow-evidence">
        <UCard class="evidence-card elevation-3">
          <template #header>
            <div class="card-heading">
              <h3>提交截图</h3>
              <span>私有证据</span>
            </div>
          </template>
          <img
            v-if="!evidenceError"
            class="evidence-image"
            :src="evidenceSrc"
            alt="玩家提交的挑战截图"
            @error="emit('evidence-error')"
          />
          <p v-else class="evidence-message" role="status">暂无截图。</p>
        </UCard>
      </div>

      <div class="decision-rail">
        <!-- Claim first: what is being reviewed -->
        <section class="claim-card elevation-2 flow-claim" aria-labelledby="claim-title">
          <header class="claim-card__header">
            <div>
              <p class="rail-kicker">申请目标</p>
              <h3 id="claim-title">{{ challengeSummary?.title ?? "未绑定挑战" }}</h3>
            </div>
            <span v-if="challengeSummary" class="claim-kind">{{ challengeSummary.kind }}</span>
          </header>
          <template v-if="challengeSummary">
            <p v-if="challengeSummary.meta" class="claim-meta">{{ challengeSummary.meta }}</p>
            <dl v-if="challengeSummary.condition || challengeSummary.evidenceRule" class="claim-facts">
              <div v-if="challengeSummary.condition"><dt>完成条件</dt><dd>{{ challengeSummary.condition }}</dd></div>
              <div v-if="challengeSummary.evidenceRule"><dt>截图规则</dt><dd>{{ challengeSummary.evidenceRule }}</dd></div>
            </dl>
          </template>
          <p v-else class="claim-empty">请在自动判定中选择挑战后再通过。</p>
        </section>

        <!-- Decision chrome: sticky while scrolling verification -->
        <section
          class="actions-card glass elevation-2 flow-actions"
          aria-label="审核操作"
          :aria-busy="actionLoading || undefined"
        >
          <p class="rail-kicker">审核决定</p>
          <div class="actions" role="group" aria-label="审核决定">
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
            <div>
              <h4 id="spot-check-title">自动判定抽检</h4>
              <p>请核对截图与称号结果。抽检不影响自动结果，发现错误时可撤销称号。</p>
            </div>
            <div class="spot-check-actions">
              <UButton
                class="action-btn pressable"
                type="button"
                block
                label="确认抽检"
                color="neutral"
                variant="outline"
                :loading="spotCheckLoading('confirmed')"
                :disabled="actionsLoading"
                @click="emitSpotCheck('confirmed')"
              />
              <UButton
                class="action-btn pressable"
                type="button"
                block
                label="撤销称号"
                color="error"
                variant="soft"
                :loading="spotCheckLoading('revoked')"
                :disabled="actionsLoading"
                @click="emitSpotCheck('revoked')"
              />
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

        <!-- Verify: match + OCR stacked beside evidence -->
        <div class="flow-signals">
          <AdminSubmissionReviewSignals
            stacked
            :submission="submission"
            :challenge-selection-error="challengeSelectionError"
            :challenge-selection-loading="challengeSelectionLoading"
            @select-challenge="emit('select-challenge', $event)"
          />
        </div>

        <!-- Traceability (low priority) -->
        <details class="meta-disclosure flow-meta">
          <summary>提交信息</summary>
          <dl class="detail-list meta-list">
            <div><dt>提交编号</dt><dd>{{ submission.submissionId }}</dd></div>
            <div>
              <dt>玩家</dt>
              <dd>
                <NuxtLink class="player-link" :to="`/admin/players/${encodeURIComponent(submission.playerAccountId)}`">
                  {{ submission.playerName }}
                </NuxtLink>
              </dd>
            </div>
            <div><dt>提交时间</dt><dd>{{ formatTime(submission.createdAt) }}</dd></div>
            <div><dt>最后更新</dt><dd>{{ formatTime(submission.updatedAt) }}</dd></div>
          </dl>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.review-detail {
  display: grid;
  gap: 18px;
}

/* Context strip */
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
.detail-meta__player:hover,
.detail-meta__player:focus-visible {
  color: var(--accent);
  text-decoration: underline;
}
.detail-meta__sep,
.detail-meta__label,
.detail-meta__time {
  color: var(--quiet);
}
.player-link {
  color: var(--accent);
  font-weight: 650;
  text-decoration: none;
}
.player-link:hover,
.player-link:focus-visible {
  text-decoration: underline;
}

/* Desktop workspace: evidence | decision rail */
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, .95fr);
  align-items: start;
  gap: clamp(16px, 2.2vw, 26px);
}
.evidence-col {
  position: sticky;
  top: 20px;
  min-width: 0;
}
.decision-rail {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.evidence-card {
  border-color: var(--line);
}
.evidence-image {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.evidence-message {
  margin: 0;
  padding: 96px 0;
  color: var(--muted);
  text-align: center;
}

.rail-kicker {
  margin: 0 0 6px;
  color: var(--text-on-glass-quiet);
  font-size: .68rem;
  font-weight: 720;
  letter-spacing: .06em;
}

/* Decision material */
.actions-card {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid color-mix(in oklch, var(--line) 88%, transparent);
  border-radius: 14px;
  box-shadow:
    var(--elevation-2),
    inset 0 1px 0 color-mix(in oklch, white 28%, transparent);
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
  padding-inline: 6px;
  font-size: .76rem;
  font-weight: 650;
}
.ocr-retry-error {
  margin: 0;
  color: var(--danger);
  font-size: .78rem;
}
.spot-check-panel {
  display: grid;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
}
.spot-check-panel h4 {
  margin: 0;
  font-size: .82rem;
}
.spot-check-panel p {
  margin: 4px 0 0;
  color: var(--text-on-glass-quiet);
  font-size: .75rem;
  line-height: 1.5;
}
.spot-check-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* Claim */
.claim-card {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-raised);
  box-shadow: var(--elevation-1);
}
.claim-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.claim-card__header h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 720;
  letter-spacing: -.02em;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.claim-kind {
  flex: 0 0 auto;
  margin-top: 18px;
  color: var(--quiet);
  font-size: .72rem;
  font-weight: 650;
  white-space: nowrap;
}
.claim-meta {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: .8rem;
  line-height: 1.4;
}
.claim-facts {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.claim-facts > div {
  display: grid;
  gap: 3px;
}
.claim-facts dt {
  color: var(--quiet);
  font-size: .72rem;
}
.claim-facts dd {
  margin: 0;
  color: var(--text);
  font-size: .82rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.claim-empty {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: .8rem;
  line-height: 1.5;
}

/* Traceability */
.meta-disclosure {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.meta-disclosure > summary {
  cursor: pointer;
  list-style: none;
  padding: 12px 14px;
  color: var(--quiet);
  font-size: .78rem;
  font-weight: 650;
  user-select: none;
}
.meta-disclosure > summary::-webkit-details-marker {
  display: none;
}
.meta-disclosure > summary::after {
  content: "▸";
  float: right;
  color: var(--quiet);
}
.meta-disclosure[open] > summary::after {
  content: "▾";
}
.meta-disclosure .meta-list {
  padding: 0 14px 12px;
}

/* Desktop: keep decisions available while scrolling the rail */
@media (min-width: 821px) {
  .flow-actions {
    position: sticky;
    top: 20px;
    z-index: 5;
  }
}

/*
 * Tablet: single column.
 * Visual order: claim → actions → evidence → signals → meta
 * (decision-rail uses display:contents so children reorder with evidence)
 */
@media (max-width: 820px) {
  .detail-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .decision-rail {
    display: contents;
  }
  .flow-claim {
    order: 0;
  }
  .flow-actions {
    order: 1;
    position: sticky;
    z-index: 4;
    top: 12px;
  }
  .flow-evidence {
    order: 2;
    position: static;
  }
  .flow-signals {
    order: 3;
  }
  .flow-meta {
    order: 4;
  }
}

/* Phone: bottom decision dock in thumb reach */
@media (max-width: 620px) {
  .detail-meta-bar {
    align-items: flex-start;
  }
  .review-detail {
    padding-bottom: calc(220px + env(safe-area-inset-bottom, 0px));
  }
  .flow-claim {
    order: 0;
  }
  .flow-evidence {
    order: 1;
  }
  .flow-signals {
    order: 2;
  }
  .flow-meta {
    order: 3;
  }
  .flow-actions {
    order: 5;
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
}

@media (prefers-reduced-transparency: reduce) {
  .actions-card {
    background: var(--glass-bg-solid-raised);
    border-color: var(--line-strong);
    box-shadow: none;
  }
  .claim-card,
  .evidence-card {
    box-shadow: none;
  }
}

@media (prefers-contrast: more) {
  .actions-card,
  .claim-card,
  .evidence-card,
  .meta-disclosure {
    border-color: var(--text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .actions-card {
    transition:
      background-color var(--theme-transition),
      border-color var(--theme-transition),
      color var(--theme-transition);
  }
}
</style>
