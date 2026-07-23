<script setup lang="ts">
import type { PublicAchievement } from "~/components/AchievementCatalog.vue";
import MyAchievementOverview from "~/components/MyAchievementOverview.vue";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({ title: "成就 · 躲避堡垒 3", description: "查看已发布的成就挑战与完成条件。" });

const api = usePortalApi();
const { player, refresh } = useCurrentPlayer();
const { items: ownedTitles, refresh: refreshTitles } = usePlayerTitles();
const challenges = ref<PublicAchievement[]>([]);
const loading = ref(true);
const error = shallowRef("");

onMounted(async () => {
  try {
    const currentPlayer = await refresh();
    if (currentPlayer) {
      const [challengeResult, titleResult] = await Promise.all([
        api<{ items: PublicAchievement[] }>("/v1/public/achievements"),
        refreshTitles(),
      ]);
      challenges.value = challengeResult.items;
      ownedTitles.value = titleResult;
    } else {
      challenges.value = (await api<{ items: PublicAchievement[] }>("/v1/public/achievements")).items;
    }
  } catch (cause) {
    error.value = portalErrorDetails(cause, "请稍后重试。").description;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="achievements-page page-shell">
    <section class="page-intro" aria-labelledby="achievements-title"><h1 id="achievements-title" class="page-title">{{ player ? "我的成就" : "成就" }}</h1></section>
    <section v-if="loading" class="achievement-directory surface-card" aria-label="成就列表"><p class="directory-state" role="status">读取中…</p></section>
    <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取成就" :description="error" />
    <template v-else-if="player"><MyAchievementOverview :challenges="challenges" :titles="ownedTitles" /></template>
    <section v-else class="achievement-directory surface-card" aria-label="成就列表">
      <AchievementCatalog :challenges="challenges" />
    </section>
  </main>
</template>

<style scoped>
.achievements-page { padding-block: clamp(64px, 9vh, 104px) 72px; }.page-intro { max-width: 690px; margin-bottom: 32px; }.achievement-directory { padding: clamp(22px, 4vw, 36px); }.directory-state { margin: 0; padding: 100px 0; color: var(--muted); text-align: center; }
@media (max-width: 620px) { .achievements-page { padding-block: 48px 48px; }.page-intro { margin-bottom: 20px; } }
</style>
