<script setup lang="ts">
import type { PublicAchievement } from "~/components/AchievementCatalog.vue";

useSeoMeta({ title: "成就 · 躲避堡垒 3", description: "查看已发布的成就挑战与完成条件。" });

const api = usePortalApi();
const { player, refresh } = useCurrentPlayer();
const { items: ownedTitles, refresh: refreshTitles } = usePlayerTitles();
const challenges = ref<PublicAchievement[]>([]);
const loading = ref(true);
const error = ref(false);

onMounted(async () => {
  const [playerResult, challengeResult] = await Promise.allSettled([
    refresh(),
    api<{ items: PublicAchievement[] }>("/v1/public/achievements"),
  ]);
  if (challengeResult.status === "fulfilled") challenges.value = challengeResult.value.items;
  else error.value = true;
  if (playerResult.status === "fulfilled" && playerResult.value) await refreshTitles().catch(() => { error.value = true; });
  loading.value = false;
});
</script>

<template>
  <main class="achievements-page page-shell">
    <section class="page-intro" aria-labelledby="achievements-title"><h1 id="achievements-title" class="page-title">{{ player ? "我的成就" : "成就" }}</h1></section>
    <section class="achievement-directory surface-card" aria-label="成就列表">
      <p v-if="loading" class="directory-state" role="status">读取中…</p>
      <p v-else-if="error" class="directory-state directory-error" role="alert">无法读取成就目录，请稍后重试。</p>
      <AchievementCatalog v-else :challenges="challenges" :owned-titles="player ? ownedTitles : undefined" />
    </section>
  </main>
</template>

<style scoped>
.achievements-page { padding-block: clamp(64px, 9vh, 104px) 72px; }.page-intro { max-width: 690px; margin-bottom: 32px; }.achievement-directory { padding: clamp(22px, 4vw, 36px); }.directory-state { margin: 0; padding: 100px 0; color: var(--muted); text-align: center; }.directory-error { color: var(--danger); }
@media (max-width: 620px) { .achievements-page { padding-block: 48px 48px; }.page-intro { margin-bottom: 20px; } }
</style>
