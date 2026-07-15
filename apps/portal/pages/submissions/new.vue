<script setup lang="ts">
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交挑战 · 躲避堡垒 3" });
const { maps, mapChallenges, achievementChallenges, loading, catalogLoading, error, loadCatalog, submit } = useSubmissionUpload();
const challengeId = ref("");
const file = ref<File | null>(null);
const message = ref("");
const selectedChallenge = computed(() => [...mapChallenges.value, ...achievementChallenges.value].find((challenge) => challenge.challengeId === challengeId.value));
const onFile = (event: Event) => { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; };
const send = async () => { if (!file.value || !challengeId.value) return; message.value = "正在上传…"; try { await submit(challengeId.value, file.value); message.value = "已提交，正在识别。"; file.value = null; } catch { message.value = "提交失败，请检查截图后重试。"; } };
onMounted(() => void loadCatalog());
</script>

<template>
  <main class="submit-page page-shell">
    <NuxtLink to="/me" class="back-link">← 玩家中心</NuxtLink>
    <section class="submit-intro"><p class="eyebrow">挑战提交</p><h1 class="page-title">提交完成截图</h1><p class="body-copy">选择一个挑战目标，上传一张完整截图。识别通过后进入人工核对。</p></section>
    <div class="submit-layout">
      <section class="catalog-pane surface-card" aria-label="挑战目录">
        <div v-if="catalogLoading" class="catalog-loading" role="status">正在读取可提交内容…</div>
        <SubmissionCatalog v-else :maps="maps" :map-challenges="mapChallenges" :achievement-challenges="achievementChallenges" :selected-challenge-id="challengeId" @select="challengeId = $event" />
      </section>
      <form class="upload-panel surface-card" @submit.prevent="send">
        <div><p class="eyebrow">提交面板</p><h2>上传证据</h2></div>
        <div class="selected-target" :class="{ empty: !selectedChallenge }"><span>当前目标</span><strong>{{ selectedChallenge?.family === 'achievement' ? selectedChallenge.titleName : selectedChallenge?.name ?? '尚未选择挑战' }}</strong><small v-if="selectedChallenge?.family === 'map'">{{ selectedChallenge.mapName }} · {{ selectedChallenge.difficulty ?? '地图通关' }}</small><small v-else-if="selectedChallenge">{{ selectedChallenge.category }} · {{ selectedChallenge.condition }}</small></div>
        <label class="file-field">截图<input accept="image/jpeg,image/png,image/webp" type="file" required @change="onFile" /><small>仅支持 JPG、PNG、WebP，单张不超过 10 MB。</small></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="message" class="form-message" role="status">{{ message }}</p>
        <button class="primary-button" :disabled="loading || catalogLoading || !file || !challengeId" type="submit">{{ loading ? "上传中…" : "提交截图" }}</button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.submit-page { padding-block: 72px; }.back-link { color: inherit; text-decoration: none; }.submit-intro { max-width: 650px; margin: 72px 0 32px; }.submit-layout { display: grid; grid-template-columns: minmax(0, 1fr) clamp(280px, 28vw, 340px); align-items: start; gap: 24px; min-width: 0; }.catalog-pane { min-width: 0; padding: 22px; }.upload-panel { position: sticky; top: 24px; display: grid; gap: 20px; min-width: 0; width: 100%; padding: 22px; overflow: hidden; }.upload-panel > * { min-width: 0; max-width: 100%; }.upload-panel h2 { margin: 5px 0 0; color: var(--text); font-size: 1.3rem; letter-spacing: -.04em; }.catalog-loading { padding: 22px 0; color: var(--muted); }.selected-target { display: grid; gap: 6px; min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--accent-surface); overflow-wrap: anywhere; }.selected-target span, .selected-target small { color: var(--muted); font-size: .78rem; }.selected-target strong { color: var(--text); overflow-wrap: anywhere; }.selected-target.empty { background: var(--surface-raised); }.file-field { display: grid; gap: 8px; min-width: 0; color: var(--muted); font-size: .82rem; }.file-field input { display: block; width: 100%; max-width: 100%; min-width: 0; min-height: 46px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); background: var(--surface-raised); }.file-field small { color: var(--quiet); overflow-wrap: anywhere; }.primary-button { width: 100%; min-height: 46px; padding: 0 16px; border: 0; border-radius: 10px; color: var(--on-accent); background: var(--accent); font-weight: 700; }.primary-button:disabled { opacity: .5; }.form-error, .form-message { min-width: 0; margin: 0; overflow-wrap: anywhere; }.form-error { color: var(--danger); }.form-message { color: var(--muted); }
@media (max-width: 820px) { .submit-page { padding-block: 36px 56px; }.submit-intro { margin: 48px 0 24px; }.submit-layout { grid-template-columns: 1fr; }.upload-panel { position: static; order: -1; }.challenge-grid { max-height: none; } }
@media (prefers-reduced-motion: reduce) { .upload-panel, .catalog-pane { scroll-behavior: auto; } }
</style>
