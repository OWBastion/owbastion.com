<script setup lang="ts">
const route = useRoute();
const config = useRuntimeConfig();
const submissionId = String(route.params.submissionId);
const { data, error } = await useFetch<{
  submissionId: string;
  status: string;
  mapName: string;
  createdAt: number;
  updatedAt: number;
}>(`${config.public.apiBaseUrl}/v1/submissions/${encodeURIComponent(submissionId)}`);

const statusText: Record<string, string> = {
  received: "已收到",
  evidence_pending: "正在保存截图",
  evidence_stored: "截图已保存",
  ocr_pending: "等待识别",
  resubmission_required: "需要重新提交",
};
</script>

<template>
  <main class="submission-page">
    <NuxtLink to="/" class="back-link">← OWBastion</NuxtLink>
    <p class="eyebrow">SUBMISSION STATUS</p>
    <h1>提交进度</h1>
    <p v-if="error" class="message">暂时无法找到这条提交记录。</p>
    <section v-else-if="data" class="card" aria-live="polite">
      <dl>
        <div><dt>提交编号</dt><dd>{{ data.submissionId }}</dd></div>
        <div><dt>地图</dt><dd>{{ data.mapName }}</dd></div>
        <div><dt>状态</dt><dd>{{ statusText[data.status] ?? data.status }}</dd></div>
      </dl>
    </section>
    <p v-else class="message">正在读取提交状态……</p>
  </main>
</template>

<style scoped>
.submission-page { min-height: 100svh; padding: 40px clamp(20px, 8vw, 120px); color: oklch(18% 0.02 175); background: oklch(94% 0.025 80); font-family: "Avenir Next", "Noto Sans CJK SC", sans-serif; }
.back-link { color: inherit; text-decoration: none; }
.eyebrow { margin: 120px 0 20px; color: oklch(61% 0.16 38); font-size: .72rem; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 0 0 36px; font-family: Georgia, "Noto Serif SC", serif; font-size: clamp(3rem, 8vw, 7rem); font-weight: 400; letter-spacing: -.08em; }
.card { max-width: 720px; padding: 28px; border: 1px solid oklch(18% 0.02 175 / 18%); background: oklch(98% 0.01 80 / 70%); }
dl { margin: 0; }
dl div { display: flex; justify-content: space-between; gap: 24px; padding: 18px 0; border-bottom: 1px solid oklch(18% 0.02 175 / 12%); }
dl div:last-child { border-bottom: 0; }
dt { color: oklch(45% 0.025 175); }
dd { margin: 0; font-weight: 700; text-align: right; word-break: break-all; }
.message { color: oklch(45% 0.025 175); }
</style>
