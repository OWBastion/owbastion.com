<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";

type SubmissionDetail = {
  submissionId: string;
  status: string;
  mapName: string;
  challengeId?: string;
  difficulty?: string;
  reason?: string;
  createdAt: number;
  updatedAt: number;
  evidenceUrl?: string | null;
  ocrFailCount?: number;
  manualReviewEligible?: boolean;
  titleGrant?: { grantId: string; titleKey: string; titleName: string; mapName?: string };
  ocr?: { mapName: string | null; difficulty: string | null; playerName: string | null; challengeCompleted: boolean | null; achievementTitles: string[] };
};

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交详情 · 躲避堡垒 3" });

const route = useRoute();
const api = usePortalApi();
const submissionId = String(route.params.submissionId);
const { data, error, status: fetchStatus, refresh } = await useAsyncData(
  `player-submission:${submissionId}`,
  () => api<SubmissionDetail>(`/v1/me/submissions/${encodeURIComponent(submissionId)}`),
);
const { maps, mapChallenges, achievementChallenges, catalogLoading, error: catalogError, loadCatalog } = useSubmissionUpload();
const selectedChallengeId = shallowRef("");
const selectedMapId = shallowRef("");
const confirming = shallowRef(false);
const requestingManualReview = shallowRef(false);
const refreshingStatus = shallowRef(false);
const manualReviewRequested = shallowRef(false);
const confirmError = shallowRef("");
const manualReviewError = shallowRef("");
const refreshError = shallowRef("");
const actionMessage = shallowRef("");
let ocrPollTimer: ReturnType<typeof setInterval> | null = null;
const evidenceUrl = `/api/portal/submissions/${encodeURIComponent(submissionId)}/evidence`;
const evidenceImageUrl = shallowRef<string | null>(null);
const evidenceState = shallowRef<"loading" | "ready" | "missing" | "failed">("loading");
const evidenceCdnHeader = { "x-owbastion-review": "portal-player" };
const resubmissionTips = [
  { icon: "i-lucide-panels-top-left", title: "保留完整通关数据", description: "确保通关时间、击杀数和其他关键数据清晰可见。" },
  { icon: "i-lucide-clipboard-check", title: "包含挑战信息", description: "保留地图、难度和挑战相关信息。" },
  { icon: "i-lucide-scan-search", title: "提高画面清晰度", description: "建议使用原始截图，避免裁剪或压缩。" },
];

const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
const ocrValue = (value: string | boolean | null) => value === null ? "未识别" : typeof value === "boolean" ? value ? "已识别完成" : "未识别完成" : value;
const pageDescription = computed(() => data.value?.status === "resubmission_required" ? "截图未通过识别，请查看原因后重新提交。" : data.value?.titleGrant ? "称号已获得。" : "查看截图、识别结果与提交状态。");
const manualReviewEligible = computed(() => data.value?.manualReviewEligible === true);
const needsChallengeConfirmation = computed(() => Boolean(data.value && !data.value.challengeId && data.value.status === "awaiting_player_confirmation"));
const mutationBusy = computed(() => confirming.value || requestingManualReview.value || refreshingStatus.value);
const statusAlert = computed(() => {
  if (data.value?.status === "ocr_pending") return { title: "截图已上传，等待识别", description: "识别通过后确认对应的地图通关或成就挑战。", color: "info" as const };
  if (data.value?.status === "ocr_review_required") return { title: "等待处理", description: "已提交处理申请，请稍后查看结果。", color: "warning" as const };
  if (data.value?.status === "resubmission_required") return { title: "需重新提交", description: data.value.reason ?? "请重新提交截图。", color: "warning" as const };
  if (data.value?.titleGrant) return { title: "称号已获得", description: `已获得「${data.value.titleGrant.titleName}」${data.value.titleGrant.mapName ? ` · ${data.value.titleGrant.mapName}` : ""}。`, color: "success" as const };
  if (data.value?.status === "awaiting_player_confirmation") return { title: "等待确认挑战", description: "请选择这张截图对应的挑战后继续。", color: "info" as const };
  if (data.value?.status === "ready_for_review") return { title: "等待核对", description: "识别已完成，请等待核对结果。", color: "info" as const };
  if (data.value?.status === "approved") return { title: "已通过", description: "提交已通过。", color: "success" as const };
  return null;
});
const evidenceDisplaySrc = computed(() => evidenceImageUrl.value ?? (evidenceState.value === "ready" || evidenceState.value === "loading" ? evidenceUrl : null));

const hasEvidenceSource = computed(() => Boolean(data.value?.evidenceUrl));

const selectChallenge = (event: { challengeId: string; mapId?: string }) => {
  if (confirming.value) return;
  selectedChallengeId.value = event.challengeId;
  selectedMapId.value = event.mapId ?? "";
};

const confirmChallenge = async () => {
  if (!selectedChallengeId.value || confirming.value) return;
  confirming.value = true;
  confirmError.value = "";
  actionMessage.value = "";
  try {
    await api(`/v1/player/submissions/${encodeURIComponent(submissionId)}/challenge`, {
      method: "POST",
      body: { contractVersion: "1", challengeId: selectedChallengeId.value, ...(selectedMapId.value ? { mapId: selectedMapId.value } : {}) },
    });
    actionMessage.value = "挑战已确认。";
    await refresh();
  } catch (cause) {
    confirmError.value = portalErrorDetails(cause, "无法确认挑战，请稍后重试。").description;
  } finally {
    confirming.value = false;
  }
};

const handleRequestManualReview = async () => {
  if (requestingManualReview.value) return;
  requestingManualReview.value = true;
  manualReviewError.value = "";
  actionMessage.value = "";
  try {
    await api(`/v1/player/submissions/${encodeURIComponent(submissionId)}/manual-review`, { method: "POST" });
    manualReviewRequested.value = true;
    actionMessage.value = "已提交申请，请等待核对结果。";
    await refresh();
  } catch (cause) {
    manualReviewError.value = portalErrorDetails(cause, "无法申请人工核对，请稍后重试。").description;
  } finally {
    requestingManualReview.value = false;
  }
};

const refreshSubmission = async () => {
  if (refreshingStatus.value || fetchStatus.value === "pending") return;
  refreshingStatus.value = true;
  refreshError.value = "";
  actionMessage.value = "";
  try {
    // Explicit refresh keeps the current detail on failure instead of replacing the page with the route error state.
    data.value = await api<SubmissionDetail>(`/v1/me/submissions/${encodeURIComponent(submissionId)}`);
  } catch (cause) {
    refreshError.value = portalErrorDetails(cause, "无法刷新状态，请稍后重试。").description;
  } finally {
    refreshingStatus.value = false;
  }
};

const markEvidenceFailed = () => {
  evidenceState.value = hasEvidenceSource.value ? "failed" : "missing";
};

const loadEvidence = async () => {
  evidenceState.value = "loading";
  if (evidenceImageUrl.value) {
    URL.revokeObjectURL(evidenceImageUrl.value);
    evidenceImageUrl.value = null;
  }
  if (!data.value?.evidenceUrl) {
    evidenceState.value = "missing";
    return;
  }
  if (data.value.evidenceUrl.startsWith("https://evidence.owbastion.codes/")) {
    try {
      const response = await fetch(data.value.evidenceUrl, { headers: evidenceCdnHeader, credentials: "omit" });
      if (!response.ok) {
        evidenceState.value = "failed";
        return;
      }
      evidenceImageUrl.value = URL.createObjectURL(await response.blob());
      evidenceState.value = "ready";
      return;
    } catch {
      evidenceState.value = "failed";
      return;
    }
  }
  evidenceState.value = "ready";
};

onMounted(() => { if (data.value && !data.value.challengeId) void loadCatalog(); });
onMounted(() => {
  if (data.value?.status !== "ocr_pending") return;
  ocrPollTimer = setInterval(async () => {
    if (fetchStatus.value === "pending" || mutationBusy.value) return;
    try { await refresh(); } catch { return; }
    if (data.value?.status !== "ocr_pending" && ocrPollTimer) {
      clearInterval(ocrPollTimer);
      ocrPollTimer = null;
    }
  }, 2000);
});
onMounted(() => { void loadEvidence(); });
onBeforeUnmount(() => {
  if (ocrPollTimer) clearInterval(ocrPollTimer);
  if (evidenceImageUrl.value) URL.revokeObjectURL(evidenceImageUrl.value);
});
</script>

<template>
  <main class="submission-page page-shell">
    <nav class="breadcrumb" aria-label="面包屑">
      <UButton to="/me" label="玩家中心" icon="i-lucide-arrow-left" color="neutral" variant="ghost" class="breadcrumb-link" />
      <span aria-hidden="true">/</span>
      <span>提交详情</span>
    </nav>

    <div class="page-heading">
      <div>
        <p class="eyebrow">提交详情</p>
        <h1 class="page-title">{{ data?.mapName ?? "提交进度" }}</h1>
        <p class="page-description">{{ pageDescription }}</p>
      </div>
    </div>

    <p v-if="error && !data" class="message" role="alert">找不到这条提交记录。</p>
    <p v-else-if="fetchStatus === 'pending' && !data" class="message" role="status">读取提交详情…</p>
    <template v-else-if="data">
      <!-- Steady submission state: visible only, never live-announced on poll/refresh. -->
      <UAlert
        v-if="statusAlert"
        class="status-alert"
        :icon="statusAlert.color === 'warning' ? 'i-lucide-triangle-alert' : statusAlert.color === 'success' ? 'i-lucide-badge-check' : 'i-lucide-scan-line'"
        :color="statusAlert.color"
        variant="subtle"
        :title="statusAlert.title"
        :description="statusAlert.description"
      />
      <!-- Single live region for ephemeral mutation feedback only (one visible + announced path). -->
      <div
        v-if="confirmError || manualReviewError || refreshError || actionMessage"
        class="status-live"
        aria-live="polite"
        aria-atomic="true"
      >
        <UAlert v-if="confirmError" color="error" variant="subtle" title="无法确认挑战" :description="confirmError" />
        <UAlert v-else-if="manualReviewError" color="error" variant="subtle" title="无法申请人工核对" :description="manualReviewError" />
        <UAlert v-else-if="refreshError" color="error" variant="subtle" title="无法刷新状态" :description="refreshError" />
        <UAlert v-else-if="actionMessage" color="success" variant="subtle" :title="actionMessage" />
      </div>

      <section class="detail-grid">
        <div class="info-col">
          <UCard v-if="needsChallengeConfirmation" class="confirm-card elevation-2">
            <template #header>
              <div class="card-heading">
                <h2>确认挑战</h2>
                <span>识别结果仅供参考</span>
              </div>
            </template>
            <p class="confirm-copy">请选择这张截图对应的地图通关或成就挑战，确认后进入核对。</p>
            <UAlert v-if="catalogError" color="error" variant="subtle" :description="catalogError" />
            <div v-else-if="catalogLoading" class="message catalog-loading" role="status">读取挑战目录…</div>
            <template v-else>
              <div class="confirm-catalog" :class="{ 'confirm-catalog--busy': confirming }" :aria-busy="confirming || undefined" :inert="confirming || undefined">
                <SubmissionCatalog
                  :maps="maps"
                  :map-challenges="mapChallenges"
                  :achievement-challenges="achievementChallenges"
                  :selected-challenge-id="selectedChallengeId"
                  :selected-map-id="selectedMapId"
                  @select="selectChallenge"
                />
              </div>
              <UButton label="确认挑战" :loading="confirming" :disabled="!selectedChallengeId || confirming" @click="confirmChallenge" block />
            </template>
          </UCard>

          <UCard class="overview-card elevation-2">
            <template #header>
              <div class="card-heading">
                <h2>提交概览</h2>
                <SubmissionStatusBadge :status="data.status" />
              </div>
            </template>
            <dl class="detail-list">
              <div><dt>提交编号</dt><dd>{{ data.submissionId }}</dd></div>
              <div><dt>提交时间</dt><dd>{{ formatTime(data.createdAt) }}</dd></div>
              <div v-if="data.difficulty"><dt>难度</dt><dd>{{ data.difficulty }}</dd></div>
              <div v-if="data.reason"><dt>说明</dt><dd>{{ data.reason }}</dd></div>
              <div><dt>最后更新</dt><dd>{{ formatTime(data.updatedAt) }}</dd></div>
            </dl>
            <div class="overview-actions">
              <UButton
                v-if="data.status === 'resubmission_required'"
                to="/submissions/new"
                label="重新提交截图"
                icon="i-lucide-upload"
                color="primary"
                :disabled="mutationBusy"
                block
              />
              <UButton
                v-if="manualReviewEligible && !manualReviewRequested"
                label="申请人工核对"
                icon="i-lucide-user-check"
                color="neutral"
                variant="outline"
                :loading="requestingManualReview"
                :disabled="requestingManualReview || mutationBusy"
                aria-label="申请人工核对"
                @click="handleRequestManualReview"
                block
              />
              <UButton
                label="刷新状态"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="outline"
                aria-label="刷新状态"
                :loading="refreshingStatus || fetchStatus === 'pending'"
                :disabled="refreshingStatus || fetchStatus === 'pending' || confirming || requestingManualReview"
                @click="refreshSubmission"
                block
              />
            </div>
          </UCard>

          <SubmissionProgress :status="data.status" :updated-at="data.updatedAt" />

          <UCard v-if="data.ocr" class="ocr-card elevation-2">
            <template #header>
              <div class="card-heading">
                <h2>识别摘要</h2>
                <span>截图识别</span>
              </div>
            </template>
            <dl class="detail-list">
              <div><dt>地图</dt><dd>{{ ocrValue(data.ocr.mapName) }}</dd></div>
              <div><dt>难度</dt><dd>{{ ocrValue(data.ocr.difficulty) }}</dd></div>
              <div><dt>玩家</dt><dd>{{ ocrValue(data.ocr.playerName) }}</dd></div>
              <div><dt>通关标记</dt><dd>{{ ocrValue(data.ocr.challengeCompleted) }}</dd></div>
              <div v-if="data.ocr.achievementTitles?.length"><dt>识别到的成就</dt><dd>{{ data.ocr.achievementTitles.join('、') }}</dd></div>
            </dl>
          </UCard>
        </div>

        <div class="evidence-col">
          <UCard class="evidence-card elevation-3">
            <template #header>
              <div class="card-heading"><h2>提交截图</h2></div>
            </template>
            <img
              v-if="evidenceDisplaySrc && evidenceState !== 'failed' && evidenceState !== 'missing'"
              :src="evidenceDisplaySrc"
              :alt="`${data.mapName}的提交截图`"
              class="evidence-image"
              @error="markEvidenceFailed"
            />
            <p v-else-if="evidenceState === 'loading'" class="evidence-message" role="status">读取中…</p>
            <p v-else-if="evidenceState === 'missing'" class="evidence-message" role="status">暂无截图</p>
            <p v-else class="evidence-message" role="alert">无法读取截图</p>
          </UCard>
        </div>
      </section>

      <UCard v-if="data.status === 'resubmission_required'" class="resubmission-card elevation-2" aria-labelledby="resubmission-title">
        <template #header>
          <div class="card-heading"><h2 id="resubmission-title">重新提交建议</h2></div>
        </template>
        <div class="resubmission-grid">
          <div v-for="item in resubmissionTips" :key="item.title" class="resubmission-tip">
            <span class="tip-icon"><UIcon :name="item.icon" aria-hidden="true" /></span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.description }}</p>
            </div>
          </div>
        </div>
      </UCard>
    </template>

    <section v-else class="detail-grid submission-skeleton" role="status" aria-label="读取中…">
      <div class="info-col" aria-hidden="true">
        <UCard class="overview-card elevation-2 submission-skeleton-card">
          <template #header>
            <div class="card-heading">
              <USkeleton class="submission-skeleton-heading submission-skeleton-heading--overview" />
              <USkeleton class="submission-skeleton-status" />
            </div>
          </template>
          <div class="submission-skeleton-list">
            <div v-for="row in 4" :key="row" class="submission-skeleton-row">
              <USkeleton class="submission-skeleton-label" />
              <USkeleton class="submission-skeleton-value" />
            </div>
          </div>
          <div class="submission-skeleton-actions">
            <USkeleton class="submission-skeleton-action" />
            <USkeleton class="submission-skeleton-action" />
          </div>
        </UCard>
        <UCard class="overview-card elevation-2 submission-skeleton-card">
          <template #header>
            <div class="card-heading">
              <USkeleton class="submission-skeleton-heading submission-skeleton-heading--progress" />
              <USkeleton class="submission-skeleton-updated" />
            </div>
          </template>
          <div class="submission-skeleton-progress">
            <div v-for="step in 4" :key="step" class="submission-skeleton-progress-item">
              <USkeleton class="submission-skeleton-marker" />
              <div class="submission-skeleton-progress-copy">
                <USkeleton class="submission-skeleton-progress-title" />
                <USkeleton class="submission-skeleton-progress-detail" />
              </div>
            </div>
          </div>
        </UCard>
      </div>
      <div class="evidence-col" aria-hidden="true">
        <UCard class="evidence-card elevation-3 submission-skeleton-card">
          <template #header>
            <div class="card-heading"><USkeleton class="submission-skeleton-heading" /></div>
          </template>
          <USkeleton class="submission-skeleton-evidence" />
        </UCard>
      </div>
    </section>
  </main>
</template>

<style scoped>
.submission-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: clamp(28px, 4vw, 44px); color: var(--quiet); font-size: var(--type-caption-size); }
.breadcrumb-link { margin: 0; padding-inline: 0; }
.page-heading { margin-bottom: 24px; }
.page-heading .eyebrow { margin-bottom: 10px; }
.page-heading .page-title { max-width: 14ch; }
.page-description { margin: 12px 0 0; color: var(--muted); font-size: .92rem; }
.status-alert { margin-bottom: 12px; }
.status-live { display: grid; gap: 10px; margin-bottom: 16px; }
.status-alert + .status-live { margin-top: -4px; }
.status-alert { margin: 0; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: clamp(18px, 2.4vw, 28px);
  width: 100%;
}
.evidence-col, .info-col { min-width: 0; }
.info-col { display: grid; gap: 16px; }
.overview-card, .evidence-card, .ocr-card, .confirm-card, .resubmission-card { border-color: var(--line); }
.overview-actions { display: grid; gap: 8px; margin-top: 22px; }
.evidence-image { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; }
.evidence-message, .message { margin: 0; padding: 72px 0; color: var(--muted); font-size: .88rem; text-align: center; }
.catalog-loading { padding: 28px 0; }
.confirm-copy { margin: 0 0 18px; color: var(--muted); }
.confirm-card :deep(.catalog) { margin-bottom: 20px; }
.confirm-catalog--busy { opacity: .72; }
.resubmission-card { display: grid; margin-top: clamp(18px, 2.4vw, 28px); }
.resubmission-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.resubmission-tip { display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: start; gap: 10px; }
.tip-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--line));
  border-radius: 10px;
  color: var(--accent);
  background: var(--accent-surface);
}
.tip-icon > svg { width: 17px; height: 17px; }
.resubmission-tip strong { display: block; color: var(--text); font-size: .82rem; }
.resubmission-tip p { margin: 4px 0 0; color: var(--muted); font-size: .76rem; line-height: 1.5; }
.submission-skeleton { align-items: start; }
.submission-skeleton-card { border-color: var(--line); }
.submission-skeleton-heading { width: 104px; height: 18px; }
.submission-skeleton-heading--overview { width: 96px; }
.submission-skeleton-heading--progress { width: 82px; }
.submission-skeleton-status { width: 72px; height: 24px; border-radius: 999px; }
.submission-skeleton-evidence { width: 100%; aspect-ratio: 4 / 3; }
.submission-skeleton-list { display: grid; gap: 0; }
.submission-skeleton-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}
.submission-skeleton-row:last-child { padding-bottom: 0; border-bottom: 0; }
.submission-skeleton-label { width: 30%; height: 12px; }
.submission-skeleton-value { width: 42%; height: 14px; }
.submission-skeleton-actions { display: grid; gap: 8px; margin-top: 22px; }
.submission-skeleton-action { width: 100%; height: 40px; border-radius: 999px; }
.submission-skeleton-updated { width: 92px; height: 12px; }
.submission-skeleton-progress { display: grid; gap: 0; }
.submission-skeleton-progress-item {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  min-height: 68px;
}
.submission-skeleton-progress-item:not(:last-child)::after {
  position: absolute;
  top: 32px;
  bottom: 0;
  left: 15px;
  width: 1px;
  background: var(--line);
  content: "";
}
.submission-skeleton-marker { position: relative; z-index: 1; width: 32px; height: 32px; border-radius: 50%; }
.submission-skeleton-progress-copy { display: grid; align-content: start; gap: 8px; padding: 4px 0 16px; }
.submission-skeleton-progress-title { width: 68%; height: 14px; }
.submission-skeleton-progress-detail { width: 92%; height: 12px; }
@media (min-width: 821px) {
  .detail-grid {
    grid-template-columns: minmax(0, 1.7fr) minmax(300px, .9fr);
  }
  .evidence-col {
    grid-column: 1;
    grid-row: 1;
    position: sticky;
    top: 24px;
  }
  .info-col {
    grid-column: 2;
    grid-row: 1;
  }
}
@media (max-width: 820px) {
  .resubmission-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 620px) {
  .submission-page { padding-top: 56px; }
  .page-heading .page-title { max-width: none; }
  .breadcrumb { margin-bottom: 30px; }
  .submission-skeleton-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
  .submission-skeleton-label, .submission-skeleton-value { width: 62%; }
}
@media (max-width: 360px) {
  .submission-page { padding-block: 48px 48px; }
  .overview-actions :deep(button) { min-height: 44px; }
}
@media (prefers-reduced-transparency: reduce) {
  .overview-card, .evidence-card, .ocr-card, .confirm-card, .resubmission-card { box-shadow: none; }
  .tip-icon { background: var(--surface); }
}
@media (prefers-contrast: more) {
  .overview-card, .evidence-card, .ocr-card, .confirm-card, .resubmission-card { border-color: var(--text); }
}
@media (prefers-reduced-motion: reduce) {
  .confirm-catalog--busy { opacity: 1; }
}
</style>
