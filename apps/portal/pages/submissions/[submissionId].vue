<script setup lang="ts">
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
const manualReviewRequested = shallowRef(false);
const OCR_MANUAL_REVIEW_THRESHOLD = 2;
let ocrPollTimer: ReturnType<typeof setInterval> | null = null;
const evidenceUrl = `/api/portal/submissions/${encodeURIComponent(submissionId)}/evidence`;
const evidenceImageUrl = shallowRef<string | null>(null);
const evidenceLoadError = shallowRef(false);
const evidenceCdnHeader = { "x-owbastion-review": "portal-player" };
const resubmissionTips = [
  { icon: "i-lucide-panels-top-left", title: "保留完整通关数据", description: "确保通关时间、击杀数和其他关键数据清晰可见。" },
  { icon: "i-lucide-clipboard-check", title: "包含挑战信息", description: "保留地图、难度和挑战相关信息。" },
  { icon: "i-lucide-scan-search", title: "提高画面清晰度", description: "建议使用原始截图，避免裁剪或压缩。" },
];
const refreshSubmission = () => refresh();
const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
const ocrValue = (value: string | boolean | null) => value === null ? "未识别" : typeof value === "boolean" ? value ? "已识别完成" : "未识别完成" : value;
const pageDescription = computed(() => data.value?.status === "resubmission_required" ? "截图未通过处理，请查看原因并重新提交。" : "查看截图、识别结果与提交状态。");
const manualReviewEligible = computed(() => data.value?.status === "resubmission_required" && (data.value?.ocrFailCount ?? 0) >= OCR_MANUAL_REVIEW_THRESHOLD);
const statusAlert = computed(() => {
  if (data.value?.status === "ocr_pending") return { title: "截图已上传，等待识别", description: "识别通过后可确认地图或成就挑战。", color: "info" as const };
  if (data.value?.status === "ocr_review_required") return { title: "等待人工审核", description: "已进入审核队列，请等待管理员处理。", color: "warning" as const };
  if (data.value?.status === "resubmission_required") return { title: "需要重新提交", description: data.value.reason ?? "请重新提交截图。", color: "warning" as const };
  return null;
});
const selectChallenge = (event: { challengeId: string; mapId?: string }) => {
  if (confirming.value) return;
  selectedChallengeId.value = event.challengeId;
  selectedMapId.value = event.mapId ?? "";
};

const confirmChallenge = async () => {
  if (!selectedChallengeId.value || confirming.value) return;
  confirming.value = true;
  try {
    await api(`/v1/player/submissions/${encodeURIComponent(submissionId)}/challenge`, { method: "POST", body: { contractVersion: "1", challengeId: selectedChallengeId.value, ...(selectedMapId.value ? { mapId: selectedMapId.value } : {}) } });
    await refresh();
  } finally { confirming.value = false; }
};
const handleRequestManualReview = async () => {
  if (requestingManualReview.value) return;
  requestingManualReview.value = true;
  try {
    await api(`/v1/player/submissions/${encodeURIComponent(submissionId)}/manual-review`, { method: "POST" });
    manualReviewRequested.value = true;
    await refresh();
  } finally { requestingManualReview.value = false; }
};
onMounted(() => { if (data.value && !data.value.challengeId) void loadCatalog(); });
onMounted(() => {
  if (data.value?.status !== "ocr_pending") return;
  ocrPollTimer = setInterval(async () => {
    if (fetchStatus.value === "pending") return;
    try { await refresh(); } catch { return; }
    if (data.value?.status !== "ocr_pending" && ocrPollTimer) {
      clearInterval(ocrPollTimer);
      ocrPollTimer = null;
    }
  }, 2000);
});
onMounted(async () => {
  if (!data.value?.evidenceUrl?.startsWith("https://evidence.owbastion.codes/")) return;
  const response = await fetch(data.value.evidenceUrl, { headers: evidenceCdnHeader, credentials: "omit" });
  if (response.ok) evidenceImageUrl.value = URL.createObjectURL(await response.blob());
});
onBeforeUnmount(() => {
  if (ocrPollTimer) clearInterval(ocrPollTimer);
  if (evidenceImageUrl.value) URL.revokeObjectURL(evidenceImageUrl.value);
});
</script>

<template>
  <main class="submission-page page-shell">
    <nav class="breadcrumb" aria-label="面包屑"><UButton to="/me" label="玩家中心" icon="i-lucide-arrow-left" color="neutral" variant="ghost" class="breadcrumb-link" /><span aria-hidden="true">/</span><span>提交详情</span></nav>

    <div class="page-heading">
      <div><p class="eyebrow">提交详情</p><h1 class="page-title">{{ data?.mapName ?? "提交进度" }}</h1><p class="page-description">{{ pageDescription }}</p></div>
    </div>

    <p v-if="error" class="message">找不到这条提交记录。</p>
    <template v-else-if="data">
      <section class="detail-grid" aria-live="polite">
        <div class="evidence-col">
          <UAlert v-if="statusAlert" class="status-alert" :icon="statusAlert.color === 'warning' ? 'i-lucide-triangle-alert' : 'i-lucide-scan-line'" :color="statusAlert.color" variant="subtle" :title="statusAlert.title" :description="statusAlert.description" aria-live="polite" />
          <UCard class="evidence-card">
            <template #header><div class="card-heading"><h2>提交截图</h2></div></template>
            <img v-if="!evidenceLoadError" :src="evidenceImageUrl ?? evidenceUrl" :alt="`${data.mapName}的提交截图`" class="evidence-image" @error="evidenceLoadError = true" />
            <p v-else class="evidence-message" role="status">暂无截图。</p>
          </UCard>
        </div>

        <div class="info-col">
          <UCard class="overview-card">
            <template #header><div class="card-heading"><h2>提交概览</h2><SubmissionStatusBadge :status="data.status" /></div></template>
            <dl class="detail-list">
              <div><dt>提交编号</dt><dd>{{ data.submissionId }}</dd></div>
              <div><dt>提交时间</dt><dd>{{ formatTime(data.createdAt) }}</dd></div>
              <div v-if="data.difficulty"><dt>难度</dt><dd>{{ data.difficulty }}</dd></div>
              <div v-if="data.reason"><dt>说明</dt><dd>{{ data.reason }}</dd></div>
              <div><dt>最后更新</dt><dd>{{ formatTime(data.updatedAt) }}</dd></div>
            </dl>
            <div class="overview-actions">
              <UButton v-if="data.status === 'resubmission_required'" to="/submissions/new" label="重新提交截图" icon="i-lucide-upload" color="primary" block />
              <UButton v-if="manualReviewEligible" label="申请人工处理" icon="i-lucide-user-check" color="neutral" variant="outline" :loading="requestingManualReview" :disabled="requestingManualReview" aria-label="申请人工处理" @click="handleRequestManualReview" block />
              <UAlert v-if="manualReviewRequested" color="success" variant="subtle" icon="i-lucide-check-circle" title="已提交申请" description="已进入人工审核队列，请等待管理员处理。" />
              <UButton label="刷新状态" icon="i-lucide-refresh-cw" color="neutral" variant="outline" aria-label="刷新状态" :loading="fetchStatus === 'pending'" :disabled="fetchStatus === 'pending'" @click="refreshSubmission" block />
            </div>
          </UCard>

          <SubmissionProgress :status="data.status" :updated-at="data.updatedAt" />

          <UCard v-if="data.ocr" class="ocr-card">
            <template #header><div class="card-heading"><h2>识别摘要</h2><span>OCR</span></div></template>
            <dl class="ocr-list">
              <div><dt>地图</dt><dd>{{ ocrValue(data.ocr.mapName) }}</dd></div>
              <div><dt>难度</dt><dd>{{ ocrValue(data.ocr.difficulty) }}</dd></div>
              <div><dt>玩家</dt><dd>{{ ocrValue(data.ocr.playerName) }}</dd></div>
              <div><dt>通关标记</dt><dd>{{ ocrValue(data.ocr.challengeCompleted) }}</dd></div>
              <div v-if="data.ocr.achievementTitles?.length"><dt>识别到的成就</dt><dd>{{ data.ocr.achievementTitles.join('、') }}</dd></div>
            </dl>
          </UCard>

          <UCard v-if="!data.challengeId && data.status === 'awaiting_player_confirmation'" class="confirm-card">
            <template #header><div class="card-heading"><h2>确认挑战</h2><span>识别结果仅供参考</span></div></template>
            <p class="confirm-copy">请选择这张截图对应的地图通关或成就挑战，确认后提交给管理员核对。</p>
            <UAlert v-if="catalogError" color="error" variant="subtle" :description="catalogError" />
            <div v-else-if="catalogLoading" class="message">读取挑战目录…</div>
            <template v-else>
              <div class="confirm-catalog" :class="{ 'confirm-catalog--busy': confirming }" :aria-busy="confirming || undefined">
                <SubmissionCatalog :maps="maps" :map-challenges="mapChallenges" :achievement-challenges="achievementChallenges" :selected-challenge-id="selectedChallengeId" @select="selectChallenge" />
              </div>
              <UButton label="确认挑战" :loading="confirming" :disabled="!selectedChallengeId || confirming" @click="confirmChallenge" block />
            </template>
          </UCard>
        </div>
      </section>
      <UCard v-if="data.status === 'resubmission_required'" class="resubmission-card" aria-labelledby="resubmission-title">
        <template #header><div class="card-heading"><h2 id="resubmission-title">重新提交建议</h2></div></template>
        <div class="resubmission-grid">
          <div v-for="item in resubmissionTips" :key="item.title" class="resubmission-tip">
            <span class="tip-icon"><UIcon :name="item.icon" aria-hidden="true" /></span><div><strong>{{ item.title }}</strong><p>{{ item.description }}</p></div>
          </div>
        </div>
      </UCard>
    </template>
    <p v-else class="message">读取中…</p>
  </main>
</template>

<style scoped>
.submission-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: clamp(28px, 4vw, 44px); color: var(--quiet); font-size: .78rem; }
.breadcrumb-link { margin: 0; padding-inline: 0; }
.page-heading { margin-bottom: 30px; }
.page-heading .eyebrow { margin-bottom: 10px; }
.page-heading .page-title { max-width: 14ch; }
.page-description { margin: 12px 0 0; color: var(--muted); font-size: .92rem; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, .9fr); align-items: start; gap: clamp(18px, 2.4vw, 28px); width: 100%; }
.evidence-col { position: sticky; top: 24px; min-width: 0; }
.status-alert { margin-bottom: 16px; }
.info-col { display: grid; gap: 16px; min-width: 0; }
.overview-card, .evidence-card, .ocr-card, .confirm-card, .resubmission-card { border-color: var(--line); }
.overview-card, .ocr-card, .confirm-card, .resubmission-card { box-shadow: var(--elevation-2); }
.evidence-card { box-shadow: var(--elevation-3); }
.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.card-heading h2 { margin: 0; font-size: 1rem; font-weight: 720; letter-spacing: -.02em; }
.card-heading > span { color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .04em; }
.detail-list, .ocr-list { display: grid; gap: 0; margin: 0; }
.detail-list div, .ocr-list div { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.detail-list div:first-child, .ocr-list div:first-child { padding-top: 0; }
.detail-list div:last-child, .ocr-list div:last-child { padding-bottom: 0; border-bottom: 0; }
dt { color: var(--quiet); font-size: .8rem; }
dd { min-width: 0; margin: 0; font-size: .88rem; font-weight: 650; text-align: right; overflow-wrap: anywhere; }
.overview-actions { display: grid; gap: 8px; margin-top: 22px; }
.evidence-image { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; }
.evidence-message, .message { margin: 0; padding: 96px 0; color: var(--muted); font-size: .88rem; text-align: center; }
.confirm-copy { margin: 0 0 18px; color: var(--muted); }
.confirm-card :deep(.catalog) { margin-bottom: 20px; }
.confirm-catalog--busy { pointer-events: none; opacity: .72; }
.resubmission-card { display: grid; margin-top: clamp(18px, 2.4vw, 28px); }
.resubmission-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.resubmission-tip { display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: start; gap: 10px; }
.tip-icon { display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--line)); border-radius: 10px; color: var(--accent); background: var(--accent-surface); }
.tip-icon > svg { width: 17px; height: 17px; }
.resubmission-tip strong { display: block; color: var(--text); font-size: .82rem; }
.resubmission-tip p { margin: 4px 0 0; color: var(--muted); font-size: .76rem; line-height: 1.5; }
@media (max-width: 820px) { .detail-grid { grid-template-columns: 1fr; }.evidence-col { position: static; } .resubmission-grid { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .submission-page { padding-top: 56px; }.page-heading .page-title { max-width: none; }.detail-list div, .ocr-list div { align-items: flex-start; flex-direction: column; gap: 6px; }.detail-list dd, .ocr-list dd { text-align: left; }.breadcrumb { margin-bottom: 30px; } }
@media (prefers-reduced-transparency: reduce) { .overview-card, .evidence-card, .ocr-card, .confirm-card, .resubmission-card { box-shadow: none; } .tip-icon { background: var(--surface); } }
@media (prefers-contrast: more) { .overview-card, .evidence-card, .ocr-card, .confirm-card, .resubmission-card { border-color: var(--text); } }
</style>
