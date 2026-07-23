<script setup lang="ts">
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交挑战 · 躲避堡垒 3" });

const toast = useToast();
const { maps, mapChallenges, achievementChallenges, loading, catalogLoading, error, loadCatalog, submit } = useSubmissionUpload();
const challengeId = ref("");
const file = ref<File | null>(null);
const selectedChallenge = computed(() => [...mapChallenges.value, ...achievementChallenges.value].find((challenge) => challenge.challengeId === challengeId.value));

const send = async () => {
  if (!file.value || !challengeId.value) return;
  try {
    const result = await submit(challengeId.value, file.value);
    toast.add({ title: "已收到，正在识别。", color: "success" });
    await navigateTo(`/submissions/${encodeURIComponent(result.submissionId)}`);
  } catch {
    toast.add({ title: "提交失败，请检查截图后重试。", color: "error" });
  }
};

onMounted(() => void loadCatalog());
</script>

<template>
  <main class="submit-page page-shell">
    <section class="submit-intro" aria-labelledby="submit-title">
      <p class="eyebrow">挑战提交</p>
      <h1 id="submit-title" class="page-title">提交完成截图</h1>
      <p class="body-copy">先选择挑战，再上传一张完整截图。</p>
    </section>

    <UAlert v-if="error && !selectedChallenge" color="error" variant="subtle" :description="error" role="alert" class="catalog-error" />
    <div class="submit-layout">
      <section class="catalog-pane surface-card" aria-label="挑战目录">
        <div v-if="catalogLoading" class="catalog-loading" role="status">读取中…</div>
        <SubmissionCatalog v-else :maps="maps" :map-challenges="mapChallenges" :achievement-challenges="achievementChallenges" :selected-challenge-id="challengeId" @select="challengeId = $event" />
      </section>

      <UCard class="upload-panel" variant="subtle" as="form" aria-labelledby="upload-title" @submit.prevent="send">
        <div class="panel-heading">
          <h2 id="upload-title">上传截图</h2>
        </div>
        <div class="selected-target" :class="{ empty: !selectedChallenge }" aria-live="polite">
          <span>当前目标</span>
          <strong>{{ selectedChallenge?.family === 'achievement' ? selectedChallenge.titleName : selectedChallenge?.name ?? '尚未选择挑战' }}</strong>
          <small v-if="selectedChallenge?.family === 'map'">{{ selectedChallenge.mapName }} · {{ selectedChallenge.difficulty ?? '地图通关' }}</small>
          <small v-else-if="selectedChallenge">{{ selectedChallenge.category }} · {{ selectedChallenge.condition }}</small>
        </div>
        <UFileUpload class="upload-control" v-model="file" label="选择截图" accept="image/jpeg,image/png,image/webp" :multiple="false" />
        <UAlert v-if="error && selectedChallenge" color="error" variant="subtle" :description="error" role="alert" />
        <UButton :label="loading ? '提交中…' : '提交截图'" :loading="loading" :disabled="catalogLoading || !file || !selectedChallenge" type="submit" block />
      </UCard>
    </div>
  </main>
</template>

<style scoped>
.submit-page { padding-block: clamp(56px, 8vw, 88px) 72px; }
.submit-intro { max-width: 650px; margin-bottom: 42px; }
.submit-intro .body-copy { margin-bottom: 0; }
.catalog-error { max-width: 620px; margin-bottom: 20px; }
.submit-layout { display: grid; grid-template-columns: minmax(0, 1fr) clamp(280px, 28vw, 340px); align-items: start; gap: 24px; min-width: 0; }
.catalog-pane { min-width: 0; padding: 22px; }
.upload-panel { position: sticky; top: 24px; min-width: 0; width: 100%; padding: 22px; overflow: hidden; }
.upload-panel > * { min-width: 0; max-width: 100%; }
.upload-panel :deep([data-slot="body"]) { display: grid; gap: 24px; }
.panel-heading { display: grid; gap: 6px; }
.panel-heading h2 { margin: 0; color: var(--text); font-size: 1.3rem; letter-spacing: -.04em; }
.catalog-loading { padding: 22px 0; color: var(--muted); }
.selected-target { display: grid; gap: 8px; min-width: 0; padding: 16px; border: 1px solid color-mix(in oklch, var(--accent) 26%, var(--line)); border-radius: 12px; background: color-mix(in oklch, var(--accent-surface) 68%, var(--surface)); overflow-wrap: anywhere; }
.selected-target span, .selected-target small { color: var(--muted); font-size: .78rem; }
.selected-target strong { color: var(--text); overflow-wrap: anywhere; }
.selected-target.empty { background: var(--surface-raised); }
.upload-control { width: 100%; }
.upload-panel :deep(button[type="submit"]) { min-height: 46px; }
@media (max-width: 820px) {
  .submit-page { padding-bottom: 56px; }
  .submit-layout { grid-template-columns: 1fr; }
  .upload-panel { position: static; }
  .catalog-pane { padding: 18px; }
}
@media (max-width: 430px) {
  .submit-intro { margin-bottom: 32px; }
  .catalog-pane, .upload-panel { padding: 18px; }
  .upload-panel :deep([data-slot="body"]) { gap: 20px; }
}
@media (prefers-reduced-transparency: reduce) {
  .catalog-pane, .upload-panel { background: var(--surface); }
}
</style>
