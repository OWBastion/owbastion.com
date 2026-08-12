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
  <main class="achievements-page directory-page page-shell">
    <section class="page-intro" aria-labelledby="achievements-title"><h1 id="achievements-title" class="page-title">{{ player ? "我的成就" : "成就" }}</h1><p class="body-copy">查看已发布的成就挑战与完成条件。</p></section>
    <section v-if="loading" class="achievement-directory surface-card" aria-label="成就列表" role="status">
      <div class="achievement-skeleton-groups" aria-hidden="true">
        <section v-for="group in 2" :key="group" class="achievement-skeleton-section">
          <div class="achievement-skeleton-heading"><USkeleton class="achievement-skeleton-heading-title" /><USkeleton class="achievement-skeleton-heading-count" /></div>
          <div class="achievement-skeleton-grid">
            <article v-for="card in 4" :key="card" class="achievement-skeleton-card">
              <USkeleton class="achievement-skeleton-icon" />
              <div class="achievement-skeleton-copy"><USkeleton class="achievement-skeleton-title" /><USkeleton class="achievement-skeleton-condition" /><USkeleton class="achievement-skeleton-condition achievement-skeleton-condition-short" /></div>
            </article>
          </div>
        </section>
      </div>
    </section>
    <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取成就" :description="error" />
    <template v-else-if="player"><MyAchievementOverview :challenges="challenges" :titles="ownedTitles" /></template>
    <section v-else class="achievement-directory surface-card" aria-label="成就列表">
      <AchievementCatalog :challenges="challenges" />
    </section>
  </main>
</template>

<style scoped>
.page-intro { max-width: 690px; margin-bottom: 32px; }.page-intro .body-copy { margin: 10px 0 0; }.achievement-directory { padding: clamp(22px, 4vw, 36px); }
.achievement-skeleton-groups, .achievement-skeleton-section { display: grid; gap: 18px; }.achievement-skeleton-section + .achievement-skeleton-section { margin-top: 40px; }.achievement-skeleton-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; }.achievement-skeleton-heading-title { width: 28%; height: 30px; }.achievement-skeleton-heading-count { width: 48px; height: 13px; }.achievement-skeleton-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.achievement-skeleton-card { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-content: start; gap: 16px; min-height: 124px; padding: 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }.achievement-skeleton-icon { width: 58px; height: 58px; border-radius: 14px; }.achievement-skeleton-copy { display: grid; align-content: start; gap: 9px; min-width: 0; }.achievement-skeleton-title { width: 72%; height: 20px; }.achievement-skeleton-condition { width: 100%; height: 13px; }.achievement-skeleton-condition-short { width: 76%; }
@media (max-width: 620px) { .page-intro { margin-bottom: 20px; } }
@media (max-width: 620px) { .achievement-directory { padding: 16px; }.achievement-skeleton-grid { grid-template-columns: 1fr; }.achievement-skeleton-card { min-height: 0; padding: 18px; }.achievement-skeleton-heading { align-items: flex-start; flex-direction: column; gap: 8px; }.achievement-skeleton-heading-title { width: 46%; } }
</style>
