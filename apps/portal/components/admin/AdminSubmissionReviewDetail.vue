<script setup lang="ts">
import type { AdminSubmission, AdminSubmissionChallengeOption } from "~/composables/useAdminApi";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";
import { mapVariantLabel } from "~/utils/map-variant";

type ReviewDecision = "approved" | "rejected" | "resubmission_required";
type SpotCheckDecision = "confirmed" | "revoked";

const props = defineProps<{
  submission: AdminSubmission;
  evidenceSrc: string | null;
  evidenceError?: boolean;
  reviewError?: string;
  actionLoading?: boolean;
  challengeSelectionError?: string;
  challengeSelectionLoading?: boolean;
  challengeOptions?: AdminSubmissionChallengeOption[];
  ocrRetryError?: string;
  ocrRetryLoading?: boolean;
}>();
const emit = defineEmits<{
  review: [decision: ReviewDecision, achievementTitlesReview?: { complete: boolean; titles: string[] }];
  "select-challenge": [selection: { challengeId: string; mapId?: string; gameplayRevisionId?: string }[]];
  "spot-check": [decision: SpotCheckDecision];
  "evidence-error": [];
  "open-direct-annotation": [];
  "retry-ocr": [];
}>();

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const actionsLoading = computed(() => Boolean(props.actionLoading || props.challengeSelectionLoading || props.ocrRetryLoading));

/** Which decision button is in-flight — loading only on that control for direct feedback. */
const pendingDecision = ref<ReviewDecision | null>(null);
const pendingSpotCheck = ref<SpotCheckDecision | null>(null);
const achievementTitlesReview = ref<{ complete: boolean; titles: string[] } | undefined>();

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
  emit("review", decision, achievementTitlesReview.value);
}

function updateAchievementTitlesReview(value: { complete: boolean; titles: string[] }) {
  achievementTitlesReview.value = value;
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

const selectedChallengeNames = computed(() => (props.submission.challengeSelections ?? []).map((selection) => {
  const challenge = selection.challenge;
  if (!challenge) return null;
  return challenge.family === "achievement" ? challenge.titleName : challenge.name;
}).filter((name): name is string => Boolean(name)));

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
        <span class="detail-meta__label">审核</span>
        <span class="detail-meta__sep" aria-hidden="true">·</span>
        <time class="detail-meta__time" :datetime="new Date(submission.updatedAt).toISOString()">{{ formatTime(submission.updatedAt) }}</time>
      </p>
      <StatusBadge :label="formatStatus(submission.status)" :tone="submissionStatusTone(submission.status)" />
    </header>

    <UAlert v-if="reviewError" color="error" variant="subtle" :description="reviewError" role="alert" />

    <!--
      Desktop: evidence | rail (claim → decide → verify → meta)
      Narrow: single column claim → decide → evidence → verify → meta
      Decisions stay in document flow (sticky), never fixed — fixed docks
      overflow when spot-check / OCR retry expand the control surface.
    -->
    <div class="review-layout">
      <div class="evidence-col flow-evidence">
        <UCard class="evidence-card surface-panel elevation-3">
          <template #header>
            <div class="card-heading">
              <h3>提交截图</h3>
            </div>
          </template>
          <img
            v-if="evidenceSrc && !evidenceError"
            class="evidence-image"
            :src="evidenceSrc"
            alt="玩家提交的挑战截图"
            @error="emit('evidence-error')"
          />
          <p v-else class="evidence-message" role="status">暂无截图。</p>
        </UCard>
      </div>

      <section class="claim-card surface-panel elevation-2 flow-claim" aria-labelledby="claim-title">
        <header class="claim-card__header">
          <div class="claim-card__title-block">
            <h3 id="claim-title">{{ challengeSummary?.title ?? "未绑定挑战" }}</h3>
            <p v-if="selectedChallengeNames.length > 1" class="claim-card__multiple">已选 {{ selectedChallengeNames.length }} 个挑战：{{ selectedChallengeNames.join("、") }}</p>
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

      <section
        class="actions-card glass surface-panel elevation-2 flow-actions"
        aria-label="审核操作"
        :aria-busy="actionLoading || undefined"
      >
        <div class="actions action-row" role="group" aria-label="审核决定">
          <UButton
            type="button"
            icon="i-lucide-check"
            label="通过"
            :loading="decisionLoading('approved')"
            :disabled="actionsLoading"
            @click="emitReview('approved')"
          />
          <UButton
            type="button"
            label="要求重新提交"
            color="neutral"
            variant="outline"
            :loading="decisionLoading('resubmission_required')"
            :disabled="actionsLoading"
            @click="emitReview('resubmission_required')"
          />
          <UButton
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
          <div class="spot-check-actions action-row">
            <UButton
              type="button"
              label="确认抽检"
              color="neutral"
              variant="outline"
              :loading="spotCheckLoading('confirmed')"
              :disabled="actionsLoading"
              @click="emitSpotCheck('confirmed')"
            />
            <UButton
              type="button"
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
            type="button"
            icon="i-lucide-refresh-cw"
            label="重新发送 OCRKit 请求"
            color="neutral"
            variant="ghost"
            :loading="ocrRetryLoading"
            :disabled="actionsLoading"
            @click="emit('retry-ocr')"
          />
          <UButton
            type="button"
            icon="i-lucide-pen-line"
            label="直接标注"
            color="neutral"
            variant="ghost"
            @click="emit('open-direct-annotation')"
          />
        </div>
      </section>

      <!-- Verify: match + OCR stacked beside evidence -->
      <div class="flow-signals">
          <AdminSubmissionReviewSignals
            stacked
            :submission="submission"
            :challenge-options="challengeOptions"
            :challenge-selection-error="challengeSelectionError"
            :challenge-selection-loading="challengeSelectionLoading"
            @select-challenge="emit('select-challenge', $event)"
            @review-achievements="updateAchievementTitlesReview"
          />
      </div>

      <!-- Traceability (low priority) -->
      <details class="meta-disclosure surface-panel flow-meta">
        <summary>提交信息</summary>
        <dl class="detail-grid meta-list">
          <div class="detail-grid__row"><dt>提交编号</dt><dd>{{ submission.submissionId }}</dd></div>
          <div class="detail-grid__row"><dt>提交时间</dt><dd>{{ formatTime(submission.createdAt) }}</dd></div>
          <div class="detail-grid__row"><dt>最后更新</dt><dd>{{ formatTime(submission.updatedAt) }}</dd></div>
        </dl>
      </details>
    </div>
  </section>
</template>

<style scoped>
/*
 * Layout uses fr / minmax / rem / clamp / container queries — avoid fixed px
 * docks. Touch floor follows shared hit target (2.75rem ≈ 44px at 16px root).
 */
.review-detail {
  --review-gap: clamp(0.75rem, 2.2vw, 1.25rem);
  --review-inset: clamp(0.75rem, 2vw, 1rem);
  --review-sticky-top: var(--sticky-chrome-top, max(0.75rem, env(safe-area-inset-top, 0px)));
  --review-touch: 2.75rem;

  container-type: inline-size;
  display: grid;
  gap: var(--review-gap);
  width: 100%;
  min-width: 0;
}

.detail-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  min-width: 0;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
  margin: 0;
  min-width: 0;
  color: var(--quiet);
  font-size: var(--type-label-sm-size);
  line-height: 1.35;
}
.detail-meta__player {
  color: var(--text);
  font-weight: 600;
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
  font-weight: 600;
  text-decoration: none;
}
.player-link:hover,
.player-link:focus-visible {
  text-decoration: underline;
}

.surface-panel,
.flow-evidence,
.flow-claim,
.flow-actions,
.flow-signals,
.flow-meta {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

/* Desktop: evidence | rail */
.review-layout {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: start;
  gap: var(--review-gap);
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 0.95fr);
  grid-template-areas:
    "evidence claim"
    "evidence actions"
    "evidence signals"
    "evidence meta";
}
.flow-evidence { grid-area: evidence; }
.flow-claim { grid-area: claim; }
.flow-actions { grid-area: actions; }
.flow-signals { grid-area: signals; }
.flow-meta { grid-area: meta; }

.evidence-col {
  position: sticky;
  top: var(--review-sticky-top);
  min-width: 0;
}
.evidence-card {
  display: block;
  width: 100%;
  max-width: 100%;
  border-color: var(--line);
}
.evidence-image {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.evidence-message {
  margin: 0;
  padding: 4rem 0;
  color: var(--muted);
  text-align: center;
}

.actions-card {
  display: grid;
  gap: 0.5rem;
  padding: var(--review-inset);
  border: 1px solid color-mix(in oklch, var(--line) 88%, transparent);
  border-radius: var(--radius-card);
  box-shadow:
    var(--elevation-2),
    inset 0 1px 0 color-mix(in oklch, white 28%, transparent);
}
.ocr-retry-actions {
  display: grid;
  justify-items: start;
  gap: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
}
.ocr-retry-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--type-caption-size);
  overflow-wrap: anywhere;
}
.spot-check-panel {
  display: grid;
  gap: 0.65rem;
  width: 100%;
  padding-top: 0.75rem;
  border-top: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
}
.spot-check-panel h4 {
  margin: 0;
  font-size: var(--type-label-sm-size);
}
.spot-check-panel p {
  margin: 0.25rem 0 0;
  color: var(--text-on-glass-quiet);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}

.claim-card {
  padding: var(--review-inset);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface-raised);
  box-shadow: var(--elevation-1);
}
.claim-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}
.claim-card__title-block {
  min-width: 0;
  flex: 1 1 auto;
}
.claim-card__header h3 {
  margin: 0;
  font-size: var(--type-body-size);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.claim-kind {
  flex: 0 0 auto;
  color: var(--quiet);
  font-size: var(--type-caption-size);
  font-weight: 500;
  white-space: nowrap;
}
.claim-meta {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.claim-facts {
  display: grid;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}
.claim-facts > div {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.claim-facts dt {
  color: var(--quiet);
  font-size: var(--type-caption-size);
}
.claim-facts dd {
  margin: 0;
  color: var(--text);
  font-size: var(--type-label-sm-size);
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.claim-empty {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  line-height: 1.5;
}

.meta-disclosure {
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface);
}
.meta-disclosure > summary {
  cursor: pointer;
  list-style: none;
  padding: 0.75rem var(--review-inset);
  color: var(--quiet);
  font-size: var(--type-caption-size);
  font-weight: 500;
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
  padding: 0 var(--review-inset) 0.75rem;
}

/* Sticky decisions stay in flow — never position:fixed */
.flow-actions {
  position: sticky;
  top: var(--review-sticky-top);
  z-index: 5;
}

/* Narrow: one column; claim then decide, then evidence for verification.
   Both tracks above are unfloored (minmax(0, fr)), so the two-column
   layout stays proportional at any width down to this single cq-compact
   threshold instead of squeezing one column toward a fixed floor. */
@container (max-width: 23.99rem) {
  .review-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "claim"
      "actions"
      "evidence"
      "signals"
      "meta";
  }
  .evidence-col {
    position: static;
  }
  .detail-meta-bar {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .claim-kind {
    margin-top: 0.15rem;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .actions-card {
    background: var(--glass-bg-solid-raised);
    border-color: var(--line-strong);
    box-shadow: none;
  }
  .claim-card,
  .evidence-card,
  .meta-disclosure {
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
