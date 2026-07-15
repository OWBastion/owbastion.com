<script setup lang="ts">
import type { PublicAchievement } from "~/components/AchievementCatalog.vue";

useSeoMeta({ title: "成就 · 躲避堡垒 3", description: "查看已发布的成就挑战与完成条件。" });

const api = usePortalApi();
const challenges = ref<PublicAchievement[]>([]);
const loading = ref(true);
const error = ref(false);

onMounted(async () => {
  await Promise.allSettled([
    api<{ items: PublicAchievement[] }>("/v1/public/achievements").then((response) => { challenges.value = response.items; }).catch(() => { error.value = true; }),
  ]);
  loading.value = false;
});
</script>

<template>
  <main class="achievements-page page-shell">
    <section class="page-intro" aria-labelledby="achievements-title"><p class="eyebrow">成就目录</p><h1 id="achievements-title" class="page-title">完成挑战，解锁称号</h1><p class="body-copy">查看每项成就的完成条件和截图要求。</p></section>
    <section class="achievement-directory surface-card" aria-label="成就列表">
      <p v-if="loading" class="directory-state" role="status">读取中…</p>
      <p v-else-if="error" class="directory-state directory-error" role="alert">无法读取成就目录，请稍后重试。</p>
      <AchievementCatalog v-else :challenges="challenges" />
    </section>
  </main>
</template>

<style scoped>
.achievements-page { padding-block: clamp(88px, 13vh, 145px) 72px; }.page-intro { max-width: 690px; margin-bottom: 42px; }.body-copy { max-width: 45ch; margin: 0; color: var(--muted); line-height: 1.65; }.achievement-directory { padding: clamp(22px, 4vw, 36px); }.directory-state { margin: 0; padding: 100px 0; color: var(--muted); text-align: center; }.directory-error { color: var(--danger); }
</style>
