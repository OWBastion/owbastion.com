<script setup lang="ts">
import type { AdminSubmission, AdminSubmissionReviewInput, AdminSubmissionReviewPreview, OcrAccuracyMark } from "~/composables/useAdminApi";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";
import { reviewBlockingMessage, reviewRecordLabel, verifiedRunIneligibleLabel, verifiedRunPreviewLabel } from "~/utils/submissionReview";

type ReviewDecision = "approved" | "rejected" | "resubmission_required";
type SpotCheckDecision = "confirmed" | "revoked";

const props = defineProps<{
  submission: AdminSubmission;
  evidenceSrc: string | null;
  evidenceError?: boolean;
  reviewError?: string;
  actionLoading?: boolean;
  ocrRetryError?: string;
  ocrRetryLoading?: boolean;
  ocrAccuracyError?: string;
  ocrAccuracyLoading?: boolean;
  preview?: AdminSubmissionReviewPreview | null;
  previewLoading?: boolean;
  previewError?: string;
  /** False while the displayed preview was computed for different review input. */
  previewCurrent?: boolean;
}>();
const emit = defineEmits<{
  review: [decision: ReviewDecision, reason?: string];
  "review-input": [value: AdminSubmissionReviewInput];
  "retry-preview": [];
  "spot-check": [decision: SpotCheckDecision, reason?: string];
  "evidence-error": [];
  "ocr-accuracy": [accuracy: OcrAccuracyMark];
  "retry-ocr": [];
}>();

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatStatus = (value: string) => submissionStatusText[value] ?? value;
const actionsLoading = computed(() => Boolean(props.actionLoading || props.ocrRetryLoading));

/** Which decision button is in-flight — loading only on that control for direct feedback. */
const pendingDecision = ref<ReviewDecision | null>(null);
const pendingSpotCheck = ref<SpotCheckDecision | null>(null);
const reviewInput = shallowRef<AdminSubmissionReviewInput>({ fieldCorrections: [], confirmedChallengeIds: [] });
const approvalBlocked = computed(() => !props.preview || !props.preview.approvable || Boolean(props.previewLoading) || props.previewCurrent === false);
const approvalHint = computed(() => {
  if (props.previewLoading || props.previewCurrent === false) return "正在计算通过后的结果…";
  if (props.previewError) return props.previewError;
  if (!props.preview) return "";
  return reviewBlockingMessage(props.preview.blockingCode);
});
// A decision taken while OCR runs moves the Submission on and leaves its OCR row pending for good.
const ocrPending = computed(() => props.submission.status === "ocr_pending");
const ocrQueueSendFailed = computed(() => ocrPending.value && props.submission.ocrErrorCode === "OCR_QUEUE_SEND_FAILED");
const reviewRecord = computed(() => props.submission.review ?? null);

type ConfirmTarget = { kind: "review"; decision: Exclude<ReviewDecision, "approved"> } | { kind: "spot-check"; decision: "revoked" };
const confirmTarget = shallowRef<ConfirmTarget | null>(null);
const confirmReason = shallowRef("");
const confirmCopy = computed(() => {
  const target = confirmTarget.value;
  if (!target) return null;
  if (target.kind === "spot-check") return { title: "撤销自动获得的称号", description: "撤销后玩家将失去本次自动判定获得的称号，由该提交产生的 Verified Run 也会失效。", reasonLabel: "撤销原因（可选，仅内部记录）", confirmLabel: "确认撤销" };
  // A later decision changes only the Submission; Titles and Verified Runs it already produced are managed separately.
  const retainedTitles = props.submission.activeTitleGrants?.map(({ titleName }) => titleName) ?? [];
  const retainedRun = props.submission.verifiedRunOutcome?.status === "created" || props.submission.verifiedRunOutcome?.status === "reused";
  const retainedItems = [...(retainedTitles.length ? [`已发放的称号（${retainedTitles.join("、")}）`] : []), ...(retainedRun ? ["已记录的 Verified Run"] : [])];
  const retained = retainedItems.length ? `此操作不会撤销${retainedItems.join("和")}${retainedTitles.length ? "；撤销称号请在玩家称号中处理" : ""}。` : "";
  if (target.decision === "rejected") return { title: "驳回提交", description: `玩家会看到“未通过”。${retained || "本次提交不会产生称号或 Verified Run。"}`, reasonLabel: "给玩家的说明（可选）", confirmLabel: "确认驳回" };
  return { title: "要求重新提交", description: `玩家会看到“需重新提交”，并可以上传新的截图。${retained}`, reasonLabel: "给玩家的说明（可选）", confirmLabel: "确认要求重新提交" };
});

function openConfirm(target: ConfirmTarget) {
  if (actionsLoading.value) return;
  confirmReason.value = "";
  confirmTarget.value = target;
}

function submitConfirm() {
  const target = confirmTarget.value;
  if (!target || actionsLoading.value) return;
  const reason = confirmReason.value.trim() || undefined;
  confirmTarget.value = null;
  if (target.kind === "spot-check") {
    pendingSpotCheck.value = target.decision;
    emit("spot-check", target.decision, reason);
  } else {
    pendingDecision.value = target.decision;
    emit("review", target.decision, reason);
  }
}
const verifiedRunLabel = computed(() => props.preview ? verifiedRunPreviewLabel(props.preview.verifiedRun) : null);
const verifiedRunIneligible = computed(() => props.preview ? verifiedRunIneligibleLabel(props.preview.verifiedRun) : null);
const satisfiedCompletions = computed(() => props.preview?.completions.filter((completion) => completion.basis === "satisfies") ?? []);

watch(
  () => props.actionLoading,
  (loading) => {
    if (!loading) {
      pendingDecision.value = null;
      pendingSpotCheck.value = null;
    }
  },
);

function approve() {
  if (actionsLoading.value || approvalBlocked.value) return;
  pendingDecision.value = "approved";
  emit("review", "approved");
}

function updateFieldCorrections(value: Array<{ fieldKey: string; reviewedValue: string }>) {
  reviewInput.value = { ...reviewInput.value, fieldCorrections: value };
  emit("review-input", reviewInput.value);
}

function updateConfirmedChallenges(value: string[]) {
  reviewInput.value = { ...reviewInput.value, confirmedChallengeIds: value };
  emit("review-input", reviewInput.value);
}

function decisionLoading(decision: ReviewDecision) {
  return Boolean(props.actionLoading && pendingDecision.value === decision);
}

function confirmSpotCheck() {
  if (actionsLoading.value) return;
  pendingSpotCheck.value = "confirmed";
  emit("spot-check", "confirmed");
}

function spotCheckLoading(decision: SpotCheckDecision) {
  return Boolean(props.actionLoading && pendingSpotCheck.value === decision);
}

/**
 * review-layout's column count comes from `grid-template-columns:
 * repeat(auto-fit, …)`, which is content-driven rather than tied to a fixed
 * width — there is no CSS query for "auto-fit resolved to one column," so
 * the narrow-mode order/stickiness overrides read the browser's own
 * resolved column count instead of guessing a matching breakpoint.
 */
const reviewLayoutRef = ref<HTMLElement | null>(null);
const reviewLayoutStacked = ref(false);
let reviewLayoutObserver: ResizeObserver | null = null;

function updateReviewLayoutStacked() {
  const el = reviewLayoutRef.value;
  if (!el) return;
  const columns = getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
  reviewLayoutStacked.value = columns.length <= 1;
}

onMounted(() => {
  const el = reviewLayoutRef.value;
  if (!el) return;
  updateReviewLayoutStacked();
  reviewLayoutObserver = new ResizeObserver(updateReviewLayoutStacked);
  reviewLayoutObserver.observe(el);
});

onBeforeUnmount(() => {
  reviewLayoutObserver?.disconnect();
  reviewLayoutObserver = null;
});
</script>

<template>
  <section class="review-detail" aria-label="审核详情">
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
    <div ref="reviewLayoutRef" class="review-layout" :class="{ 'review-layout--stacked': reviewLayoutStacked }">
      <div class="evidence-col flow-evidence">
        <UCard class="evidence-card surface-panel elevation-3">
          <template #header>
            <div class="card-heading">
              <h3>提交截图</h3>
            </div>
          </template>
          <EvidenceViewer v-if="evidenceSrc && !evidenceError" :src="evidenceSrc" alt="玩家提交的挑战截图" @error="emit('evidence-error')" />
          <p v-else class="evidence-message" role="status">暂无截图。</p>
        </UCard>
      </div>

      <div class="review-rail">
      <section class="claim-card surface-panel elevation-2 flow-claim" aria-labelledby="claim-title" :aria-busy="previewLoading || undefined">
        <header class="claim-card__header">
          <div class="claim-card__title-block">
            <h3 id="claim-title">通过后将产生</h3>
          </div>
        </header>
        <template v-if="preview">
          <ul v-if="preview.titles.length" class="outcome-list">
            <li v-for="title in preview.titles" :key="`${title.titleKey}:${title.mapName ?? ''}`">
              <strong>{{ title.alreadyOwned ? `已拥有「${title.titleName}」，不重复获得` : `获得「${title.titleName}」` }}</strong>
              <span v-if="title.mapName" class="claim-meta">{{ title.mapName }}</span>
            </li>
          </ul>
          <p v-if="satisfiedCompletions.length" class="claim-meta">联动完成：{{ satisfiedCompletions.map((completion) => completion.titleName).join("、") }}</p>
          <p v-if="verifiedRunLabel" class="claim-meta">{{ verifiedRunLabel }}</p>
          <p v-else-if="verifiedRunIneligible" class="claim-meta">{{ verifiedRunIneligible }}</p>
          <p v-if="!preview.titles.length && !verifiedRunLabel" class="claim-empty">不会产生称号或 Verified Run。</p>
        </template>
        <p v-else-if="ocrPending" class="claim-empty" role="status">正在重新识别截图，完成后自动刷新。</p>
        <p v-else-if="!previewLoading && !previewError" class="claim-empty">没有可核对的识别结果，无法通过。可以在下方手动填写截图中的字段，重新发送 OCRKit 请求，或要求重新提交。</p>
        <p v-if="approvalHint" id="approval-hint" class="claim-hint" :class="{ 'claim-hint--error': !previewLoading && previewCurrent !== false && Boolean(previewError || preview?.blockingCode) }" role="status">{{ approvalHint }}</p>
        <UButton v-if="previewError && !previewLoading" type="button" label="重新计算" icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="ghost" @click="emit('retry-preview')" />
      </section>

      <section
        class="actions-card glass surface-panel elevation-2 flow-actions"
        aria-label="审核操作"
        :aria-busy="actionLoading || undefined"
      >
        <div v-if="reviewRecord" class="review-record">
          <p>上次审核：<strong>{{ reviewRecordLabel(reviewRecord) }}</strong> · <time :datetime="new Date(reviewRecord.reviewedAt).toISOString()">{{ formatTime(reviewRecord.reviewedAt) }}</time></p>
          <p v-if="reviewRecord.reason" class="review-record__reason">说明：{{ reviewRecord.reason }}</p>
        </div>
        <div class="actions action-row" role="group" aria-label="审核决定">
          <UButton
            type="button"
            icon="i-lucide-check"
            label="通过"
            size="lg"
            :aria-describedby="approvalHint ? 'approval-hint' : undefined"
            :loading="decisionLoading('approved')"
            :disabled="actionsLoading || approvalBlocked"
            @click="approve"
          />
          <UButton
            type="button"
            label="要求重新提交"
            color="neutral"
            variant="outline"
            :loading="decisionLoading('resubmission_required')"
            :disabled="actionsLoading"
            @click="openConfirm({ kind: 'review', decision: 'resubmission_required' })"
          />
          <UButton
            type="button"
            label="驳回"
            color="error"
            variant="soft"
            :loading="decisionLoading('rejected')"
            :disabled="actionsLoading"
            @click="openConfirm({ kind: 'review', decision: 'rejected' })"
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
              @click="confirmSpotCheck"
            />
            <UButton
              type="button"
              label="撤销称号"
              color="error"
              variant="soft"
              :loading="spotCheckLoading('revoked')"
              :disabled="actionsLoading"
              @click="openConfirm({ kind: 'spot-check', decision: 'revoked' })"
            />
          </div>
        </div>

        <details class="more-actions" :open="Boolean(ocrRetryError || ocrAccuracyError || ocrQueueSendFailed) || undefined">
          <summary>更多操作</summary>
          <div class="ocr-retry-actions" :aria-busy="ocrRetryLoading || ocrAccuracyLoading || undefined">
            <p v-if="ocrRetryError" class="ocr-retry-error" role="alert">{{ ocrRetryError }}</p>
            <UButton
              type="button"
              icon="i-lucide-refresh-cw"
              :label="ocrPending && !ocrQueueSendFailed ? '识别中…' : '重新发送 OCRKit 请求'"
              color="neutral"
              variant="ghost"
              :loading="ocrRetryLoading || (ocrPending && !ocrQueueSendFailed)"
              :disabled="actionsLoading || (ocrPending && !ocrQueueSendFailed)"
              @click="emit('retry-ocr')"
            />
            <div v-if="submission.ocrResultId" class="ocr-accuracy" role="group" aria-label="识别准确性标记">
              <p class="ocr-accuracy__hint">识别准确性<span v-if="submission.ocrAccuracy">（当前：{{ submission.ocrAccuracy === "accurate" ? "准确" : "有误" }}）</span>。标记仅用于识别质量改进，不影响审核决定。</p>
              <p v-if="ocrAccuracyError" class="ocr-retry-error" role="alert">{{ ocrAccuracyError }}</p>
              <div class="ocr-accuracy__buttons">
                <UButton
                  type="button"
                  icon="i-lucide-check"
                  label="识别准确"
                  :color="submission.ocrAccuracy === 'accurate' ? 'primary' : 'neutral'"
                  :variant="submission.ocrAccuracy === 'accurate' ? 'soft' : 'ghost'"
                  size="sm"
                  :loading="ocrAccuracyLoading"
                  :disabled="actionsLoading || ocrAccuracyLoading || submission.ocrAccuracy === 'accurate'"
                  @click="emit('ocr-accuracy', 'accurate')"
                />
                <UButton
                  type="button"
                  icon="i-lucide-flag"
                  label="识别有误"
                  :color="submission.ocrAccuracy === 'inaccurate' ? 'primary' : 'neutral'"
                  :variant="submission.ocrAccuracy === 'inaccurate' ? 'soft' : 'ghost'"
                  size="sm"
                  :loading="ocrAccuracyLoading"
                  :disabled="actionsLoading || ocrAccuracyLoading || submission.ocrAccuracy === 'inaccurate'"
                  @click="emit('ocr-accuracy', 'inaccurate')"
                />
              </div>
            </div>
          </div>
        </details>
      </section>

      <!-- Verify: match + OCR stacked beside evidence -->
      <div class="flow-signals">
          <AdminSubmissionReviewSignals
            stacked
            :submission="submission"
            :preview="preview"
            :preview-loading="previewLoading"
            :disabled="actionsLoading"
            @field-corrections="updateFieldCorrections"
            @confirmed-challenges="updateConfirmedChallenges"
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
    </div>

    <AdminResponsiveDialog :open="confirmTarget !== null" :title="confirmCopy?.title ?? ''" :description="confirmCopy?.description" size="sm" @update:open="(open) => { if (!open) confirmTarget = null; }">
      <template #body>
        <form id="review-confirm-form" @submit.prevent="submitConfirm">
          <UFormField :label="confirmCopy?.reasonLabel"><UTextarea v-model="confirmReason" maxlength="512" autoresize class="w-full" /></UFormField>
        </form>
      </template>
      <template #footer>
        <UButton type="submit" form="review-confirm-form" :label="confirmCopy?.confirmLabel" :color="confirmTarget?.kind === 'review' && confirmTarget.decision === 'resubmission_required' ? 'primary' : 'error'" variant="soft" />
        <UButton type="button" label="取消" color="neutral" variant="outline" @click="confirmTarget = null" />
      </template>
    </AdminResponsiveDialog>
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

/* Evidence | rail. auto-fit collapses to a single column on its own once a
   track can no longer hold its min(20rem, 100%) floor — no explicit
   breakpoint decides the switch, so it never leaves a column too narrow for
   its content (the old 51.25rem viewport collapse is gone for good). */
.review-layout {
  display: grid;
  width: 100%;
  min-width: 0;
  align-items: start;
  gap: var(--review-gap);
  grid-template-columns: minmax(0, 1fr);
}
/* The screenshot is what the maintainer inspects, so it gets the larger share once there is room for two columns. */
@container (min-width: 56rem) {
  .review-layout { grid-template-columns: minmax(0, 3fr) minmax(20rem, 2fr); }
}
.review-rail {
  display: grid;
  gap: var(--review-gap);
  min-width: 0;
}

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
.more-actions {
  border-top: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
  padding-top: 0.5rem;
}
.more-actions > summary {
  min-height: var(--review-touch);
  display: flex;
  align-items: center;
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  font-weight: 600;
  cursor: pointer;
}
.ocr-retry-actions {
  display: grid;
  justify-items: start;
  gap: 0.25rem;
}
.ocr-retry-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--type-caption-size);
  overflow-wrap: anywhere;
}
.ocr-accuracy {
  display: grid;
  gap: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid color-mix(in oklch, var(--line) 80%, transparent);
}
.ocr-accuracy__hint {
  margin: 0;
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.ocr-accuracy__buttons {
  display: flex;
  gap: 0.5rem;
}
.review-record {
  display: grid;
  gap: 0.25rem;
  color: var(--text);
  font-size: var(--type-label-sm-size);
  line-height: 1.45;
}
.review-record p {
  margin: 0;
  overflow-wrap: anywhere;
}
.review-record__reason {
  color: var(--muted);
  font-size: var(--type-caption-size);
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
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  font-weight: 600;
  line-height: 1.4;
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
.outcome-list {
  display: grid;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}
.outcome-list li {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.outcome-list strong {
  color: var(--text);
  font-size: var(--type-card-title-size);
  font-weight: 600;
  line-height: var(--type-card-title-leading);
  overflow-wrap: anywhere;
}
.outcome-list .claim-meta {
  margin: 0;
}
.claim-hint {
  margin: 0.75rem 0 0;
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.claim-hint--error {
  color: var(--danger);
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

/* review-layout's auto-fit collapse (above) is content-driven, not tied to a
   fixed width — there is no CSS query for "auto-fit resolved to one
   column," so the narrow-order swap and the sticky evidence column read the
   browser's own resolved grid-template-columns column count instead
   (ResizeObserver in the script block) rather than approximating it with a
   width value of our own. */
.review-layout--stacked .review-rail {
  order: -1;
}
.review-layout--stacked .evidence-col {
  position: static;
}

@container (max-width: 23.99rem) {
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
