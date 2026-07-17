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
  ocr?: { mapName: string | null; difficulty: string | null; playerName: string | null; challengeCompleted: boolean | null };
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
const evidenceUrl = `/api/portal/submissions/${encodeURIComponent(submissionId)}/evidence`;
const refreshSubmission = () => refresh();
const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
const statusTone = (value: string) => value === "approved" ? "success" : value === "resubmission_required" ? "warning" : "default";
const ocrValue = (value: string | boolean | null) => value === null ? "未识别" : typeof value === "boolean" ? value ? "已识别完成" : "未识别完成" : value;
</script>

<template>
  <main class="submission-page page-shell">
    <NuxtLink to="/me" class="back-link">← 玩家中心</NuxtLink>

    <div class="page-heading">
      <div><p class="eyebrow">提交详情</p><h1 class="page-title">{{ data?.mapName ?? "提交进度" }}</h1></div>
      <UButton label="刷新状态" icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="fetchStatus === 'pending'" @click="refreshSubmission" />
    </div>

    <p v-if="error" class="message">找不到这条提交记录。</p>
    <template v-else-if="data">
      <section class="detail-grid" aria-live="polite">
        <UCard class="overview-card">
          <template #header><div class="card-heading"><h2>提交概览</h2><StatusBadge :label="submissionStatusText[data.status] ?? data.status" :tone="statusTone(data.status)" /></div></template>
          <dl class="detail-list">
            <div><dt>提交编号</dt><dd>{{ data.submissionId }}</dd></div>
            <div><dt>提交时间</dt><dd>{{ formatTime(data.createdAt) }}</dd></div>
            <div v-if="data.difficulty"><dt>难度</dt><dd>{{ data.difficulty }}</dd></div>
            <div v-if="data.reason"><dt>说明</dt><dd>{{ data.reason }}</dd></div>
          </dl>
        </UCard>

        <UCard class="evidence-card">
          <template #header><div class="card-heading"><h2>提交截图</h2><span>私有证据</span></div></template>
          <img :src="evidenceUrl" :alt="`${data.mapName}的提交截图`" class="evidence-image" />
        </UCard>

        <UCard v-if="data.ocr" class="ocr-card">
          <template #header><div class="card-heading"><h2>识别摘要</h2><span>OCR</span></div></template>
          <dl class="ocr-list">
            <div><dt>地图</dt><dd>{{ ocrValue(data.ocr.mapName) }}</dd></div>
            <div><dt>难度</dt><dd>{{ ocrValue(data.ocr.difficulty) }}</dd></div>
            <div><dt>玩家</dt><dd>{{ ocrValue(data.ocr.playerName) }}</dd></div>
            <div><dt>通关标记</dt><dd>{{ ocrValue(data.ocr.challengeCompleted) }}</dd></div>
          </dl>
        </UCard>
      </section>
    </template>
    <p v-else class="message">读取中…</p>
  </main>
</template>

<style scoped>
.submission-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.back-link { display: inline-flex; margin-bottom: clamp(32px, 5vw, 56px); color: var(--muted); font-size: .88rem; font-weight: 650; text-decoration: none; transition: color 160ms ease; }
.back-link:hover { color: var(--text); }
.page-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 30px; }
.page-heading .eyebrow { margin-bottom: 10px; }.page-heading .page-title { max-width: 14ch; }
.detail-grid { display: grid; gap: 16px; max-width: 760px; }.overview-card, .evidence-card, .ocr-card { border-color: var(--line); box-shadow: 0 8px 24px -20px var(--shadow); }.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.card-heading h2 { margin: 0; font-size: 1rem; font-weight: 720; letter-spacing: -.02em; }.card-heading > span { color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .04em; }.detail-list, .ocr-list { display: grid; gap: 0; margin: 0; }.detail-list div, .ocr-list div { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 13px 0; border-bottom: 1px solid var(--line); }.detail-list div:first-child, .ocr-list div:first-child { padding-top: 0; }.detail-list div:last-child, .ocr-list div:last-child { padding-bottom: 0; border-bottom: 0; }dt { color: var(--quiet); font-size: .8rem; }dd { min-width: 0; margin: 0; font-size: .88rem; font-weight: 650; text-align: right; overflow-wrap: anywhere; }.evidence-image { display: block; width: 100%; max-height: 80svh; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); object-fit: contain; }.message { margin: 0; color: var(--muted); }
@media (max-width: 620px) { .submission-page { padding-top: 56px; }.page-heading { align-items: flex-start; flex-direction: column; gap: 18px; }.detail-list div, .ocr-list div { align-items: flex-start; flex-direction: column; gap: 6px; }.detail-list dd, .ocr-list dd { text-align: left; }.page-heading .page-title { max-width: none; } }
@media (prefers-reduced-transparency: reduce) { .overview-card, .evidence-card, .ocr-card { box-shadow: none; } }
</style>
