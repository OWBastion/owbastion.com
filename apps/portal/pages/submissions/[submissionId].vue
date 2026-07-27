<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";

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
const confirming = shallowRef(false);
let ocrPollTimer: ReturnType<typeof setInterval> | null = null;
const evidenceUrl = `/api/portal/submissions/${encodeURIComponent(submissionId)}/evidence`;
const evidenceImageUrl = shallowRef<string | null>(null);
const evidenceLoadError = shallowRef(false);
const evidenceCdnHeader = { "x-owbastion-review": "portal-player" };
const refreshSubmission = () => refresh();
const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
const statusTone = (value: string) => value === "approved" || value === "ready_for_review" ? "success" : value === "resubmission_required" ? "warning" : "default";
const ocrValue = (value: string | boolean | null) => value === null ? "未识别" : typeof value === "boolean" ? value ? "已识别完成" : "未识别完成" : value;
const confirmChallenge = async () => {
  if (!selectedChallengeId.value) return;
  confirming.value = true;
  try {
    await api(`/v1/player/submissions/${encodeURIComponent(submissionId)}/challenge`, { method: "POST", body: { contractVersion: "1", challengeId: selectedChallengeId.value } });
    await refresh();
  } finally { confirming.value = false; }
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
    <UButton to="/me" label="玩家中心" icon="i-lucide-arrow-left" color="neutral" variant="ghost" class="back-link" />

    <div class="page-heading">
      <div><p class="eyebrow">提交详情</p><h1 class="page-title">{{ data?.mapName ?? "提交进度" }}</h1></div>
      <UButton label="刷新状态" icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="fetchStatus === 'pending'" :disabled="fetchStatus === 'pending'" @click="refreshSubmission" />
    </div>

    <p v-if="error" class="message">找不到这条提交记录。</p>
    <template v-else-if="data">
      <UAlert v-if="data.status === 'ocr_pending'" class="ocr-pending-alert" icon="i-lucide-scan-line" color="info" variant="subtle" title="截图已上传，等待 OCR 识别" description="平台正在核对截图中的玩家、通关标志和挑战数据。识别完成后，这里会显示下一步操作。" aria-live="polite" />
      <section class="detail-grid" aria-live="polite">
        <div class="evidence-col">
          <UCard class="evidence-card">
            <template #header><div class="card-heading"><h2>提交截图</h2></div></template>
            <div class="evidence-frame">
              <img v-if="!evidenceLoadError" :src="evidenceImageUrl ?? evidenceUrl" :alt="`${data.mapName}的提交截图`" class="evidence-image" @error="evidenceLoadError = true" />
              <p v-else class="evidence-message" role="status">暂无截图。</p>
            </div>
          </UCard>
        </div>

        <div class="info-col">
          <UCard class="overview-card">
            <template #header><div class="card-heading"><h2>提交概览</h2><StatusBadge :label="submissionStatusText[data.status] ?? data.status" :tone="statusTone(data.status)" /></div></template>
            <dl class="detail-list">
              <div><dt>提交编号</dt><dd>{{ data.submissionId }}</dd></div>
              <div><dt>提交时间</dt><dd>{{ formatTime(data.createdAt) }}</dd></div>
              <div v-if="data.difficulty"><dt>难度</dt><dd>{{ data.difficulty }}</dd></div>
              <div v-if="data.reason"><dt>说明</dt><dd>{{ data.reason }}</dd></div>
            </dl>
          </UCard>

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
              <SubmissionCatalog :maps="maps" :map-challenges="mapChallenges" :achievement-challenges="achievementChallenges" :selected-challenge-id="selectedChallengeId" @select="selectedChallengeId = $event" />
              <UButton label="确认挑战" :loading="confirming" :disabled="!selectedChallengeId" @click="confirmChallenge" block />
            </template>
          </UCard>
        </div>
      </section>
    </template>
    <p v-else class="message">读取中…</p>
  </main>
</template>

<style scoped>
.submission-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.ocr-pending-alert { margin-bottom: 16px; }
.back-link { margin-bottom: clamp(32px, 5vw, 56px); }
.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 30px; }
.page-heading .eyebrow { margin-bottom: 10px; }.page-heading .page-title { max-width: 14ch; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, .9fr); align-items: start; gap: clamp(18px, 2.4vw, 28px); max-width: 1100px; }.evidence-col { position: sticky; top: 24px; min-width: 0; }.info-col { display: grid; gap: 16px; min-width: 0; }.overview-card, .evidence-card, .ocr-card, .confirm-card { border-color: var(--line); box-shadow: 0 12px 32px -24px var(--shadow); }.evidence-card { box-shadow: 0 18px 44px -28px var(--shadow); }.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.card-heading h2 { margin: 0; font-size: 1rem; font-weight: 720; letter-spacing: -.02em; }.card-heading > span { color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .04em; }.detail-list, .ocr-list { display: grid; gap: 0; margin: 0; }.detail-list div, .ocr-list div { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 13px 0; border-bottom: 1px solid var(--line); }.detail-list div:first-child, .ocr-list div:first-child { padding-top: 0; }.detail-list div:last-child, .ocr-list div:last-child { padding-bottom: 0; border-bottom: 0; }dt { color: var(--quiet); font-size: .8rem; }dd { min-width: 0; margin: 0; font-size: .88rem; font-weight: 650; text-align: right; overflow-wrap: anywhere; }.evidence-frame { display: grid; min-height: clamp(300px, 56vh, 720px); place-items: center; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-raised); }.evidence-image { display: block; width: 100%; max-height: min(72vh, 820px); border-radius: 13px; object-fit: contain; }.evidence-message { margin: 0; color: var(--muted); font-size: .88rem; }.confirm-copy { margin: 0 0 18px; color: var(--muted); }.confirm-card :deep(.catalog) { margin-bottom: 20px; }.message { margin: 0; color: var(--muted); }
@media (max-width: 820px) { .detail-grid { grid-template-columns: 1fr; }.evidence-col { position: static; } .evidence-frame { min-height: clamp(240px, 58vw, 520px); } }
@media (max-width: 620px) { .submission-page { padding-top: 56px; }.page-heading { align-items: flex-start; flex-direction: column; gap: 18px; }.detail-list div, .ocr-list div { align-items: flex-start; flex-direction: column; gap: 6px; }.detail-list dd, .ocr-list dd { text-align: left; }.page-heading .page-title { max-width: none; } }
@media (prefers-reduced-transparency: reduce) { .overview-card, .evidence-card, .ocr-card, .confirm-card { box-shadow: none; } .evidence-frame { background: var(--surface); } }
@media (prefers-contrast: more) { .overview-card, .evidence-card, .ocr-card, .confirm-card { border-color: var(--text); } }
</style>
