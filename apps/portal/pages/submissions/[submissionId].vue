<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";

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

</script>

<template>
  <main class="submission-page">
    <NuxtLink to="/" class="back-link">← 躲避堡垒 3</NuxtLink>
    <p class="eyebrow">提交状态</p>
    <h1>提交进度</h1>
    <p v-if="error" class="message">找不到这条提交记录。</p>
    <section v-else-if="data" class="card" aria-live="polite">
      <dl>
        <div><dt>提交编号</dt><dd>{{ data.submissionId }}</dd></div>
        <div><dt>地图</dt><dd>{{ data.mapName }}</dd></div>
        <div><dt>状态</dt><dd>{{ submissionStatusText[data.status] ?? data.status }}</dd></div>
      </dl>
    </section>
    <p v-else class="message">读取中…</p>
  </main>
</template>

<style scoped>
.submission-page { min-height: 100svh; padding: 40px clamp(16px, 8vw, 120px); color: var(--text); background: var(--page); font-family: "Avenir Next", "Noto Sans CJK SC", sans-serif; }
.back-link { color: inherit; text-decoration: none; }
.eyebrow { margin: 120px 0 20px; color: var(--accent); font-size: .72rem; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 0 0 36px; font-family: Georgia, "Noto Serif SC", serif; font-size: clamp(3rem, 8vw, 7rem); font-weight: 400; letter-spacing: -.08em; }
.card { width: min(100%, 720px); max-width: 720px; padding: clamp(20px, 5vw, 28px); border: 1px solid var(--line); background: color-mix(in oklch, var(--surface) 82%, transparent); }
dl { margin: 0; }
dl div { display: flex; justify-content: space-between; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--line); }
dl div:last-child { border-bottom: 0; }
dt { color: var(--muted); }
dd { min-width: 0; margin: 0; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
.message { color: var(--muted); }
@media (max-width: 430px) { .submission-page { padding-top: 24px; }.submission-page .eyebrow { margin-top: 76px; }.submission-page h1 { margin-bottom: 26px; font-size: clamp(2.8rem, 15vw, 4rem); }.card dl div { align-items: flex-start; flex-direction: column; gap: 7px; }.card dd { text-align: left; } }
</style>
