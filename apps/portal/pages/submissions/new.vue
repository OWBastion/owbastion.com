<script setup lang="ts">
definePageMeta({ middleware: "auth-client" });
useSeoMeta({ title: "提交地图挑战 · 躲避堡垒 3" });
const { challenges, loading, error, loadChallenges, submit } = useSubmissionUpload();
const challengeId = ref("");
const file = ref<File | null>(null);
const message = ref("");
const onFile = (event: Event) => { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; };
const send = async () => { if (!file.value || !challengeId.value) return; message.value = "正在上传…"; try { await submit(challengeId.value, file.value); message.value = "已提交，正在识别。"; file.value = null; } catch { message.value = "提交失败，请检查截图后重试。"; } };
onMounted(() => void loadChallenges());
</script>

<template>
  <main class="submit-page page-shell">
    <NuxtLink to="/me" class="back-link">← 玩家中心</NuxtLink>
    <section class="submit-intro"><p class="eyebrow">地图挑战</p><h1 class="page-title">提交完成截图</h1><p class="body-copy">选择目标挑战并上传一张完整截图。识别通过后进入人工核对。</p></section>
    <form class="submit-card surface-card" @submit.prevent="send">
      <label>挑战<select v-model="challengeId" required><option value="" disabled>选择地图挑战</option><option v-for="challenge in challenges" :key="challenge.challengeId" :value="challenge.challengeId">{{ challenge.mapName }} · {{ challenge.difficulty }}</option></select></label>
      <label>截图<input accept="image/jpeg,image/png,image/webp" type="file" required @change="onFile" /><small>仅支持 JPG、PNG、WebP，单张不超过 10 MB。</small></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="message" class="form-message" role="status">{{ message }}</p>
      <button class="primary-button" :disabled="loading || !file || !challengeId" type="submit">{{ loading ? "上传中…" : "提交截图" }}</button>
    </form>
  </main>
</template>

<style scoped>
.submit-page { padding-block: 88px 72px; }.back-link { color: inherit; text-decoration: none; }.submit-intro { max-width: 650px; margin: 92px 0 38px; }.submit-card { display: grid; gap: 22px; width: min(100%, 620px); padding: 24px; }.submit-card label { display: grid; gap: 8px; color: var(--muted); font-size: .82rem; }.submit-card select, .submit-card input { min-height: 46px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); background: var(--surface-raised); }.submit-card input { padding: 11px; }.submit-card small { color: var(--quiet); }.primary-button { min-height: 46px; padding: 0 16px; border: 0; border-radius: 10px; color: var(--on-accent); background: var(--accent); font-weight: 700; }.primary-button:disabled { opacity: .5; }.form-error { margin: 0; color: var(--danger); }.form-message { margin: 0; color: var(--muted); }
</style>
