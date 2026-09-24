<script setup lang="ts">
import type { PublicAchievement } from "~/components/AchievementCatalog.vue";
import MyAchievementOverview from "~/components/MyAchievementOverview.vue";
import type { PortalMap } from "~/composables/usePortalApi";
import type { MapProgressChallenge } from "~/utils/map-progress";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({ title: "成就 · 躲避堡垒 3", description: "查看已发布的成就挑战与完成条件。" });

const api = usePortalApi();
const { player, refresh } = useCurrentPlayer();
const { items: ownedTitles, allTitles, refresh: refreshTitles, replaceEquipped } = usePlayerTitles();
const challenges = ref<PublicAchievement[]>([]);
const maps = ref<PortalMap[]>([]);
const mapChallenges = ref<MapProgressChallenge[]>([]);
const loading = ref(true);
const error = shallowRef("");

onMounted(async () => {
  try {
    const currentPlayer = await refresh();
    if (currentPlayer) {
      const [challengeResult, titleResult, mapResult, mapChallengeResult] = await Promise.all([
        api<{ items: PublicAchievement[] }>("/v1/public/achievements"),
        refreshTitles(),
        api<{ items: PortalMap[] }>("/v1/maps"),
        api<{ items: MapProgressChallenge[] }>("/v1/challenges?family=map"),
      ]);
      challenges.value = challengeResult.items;
      ownedTitles.value = titleResult;
      maps.value = mapResult.items;
      mapChallenges.value = mapChallengeResult.items;
    } else {
      challenges.value = (await api<{ items: PublicAchievement[] }>("/v1/public/achievements")).items;
    }
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法读取成就，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
});
const equipError = shallowRef("");
const savingEquip = shallowRef(false);
const updateEquipped = async (grantId: string) => {
  const prior = ownedTitles.value;
  const title = prior.find((item) => item.grantId === grantId);
  if (!title) return;
  const next = title.equipped ? prior.filter((item) => item.equipped && item.grantId !== grantId) : [...prior.filter((item) => item.equipped), title];
  if (next.length > 10) { equipError.value = "最多佩戴 10 个称号"; return; }
  ownedTitles.value = prior.map((item) => item.grantId === grantId ? { ...item, equipped: !item.equipped } : item);
  savingEquip.value = true; equipError.value = "";
  try { await replaceEquipped(next.map((item) => item.grantId)); }
  catch (cause) { ownedTitles.value = prior; equipError.value = portalErrorDetails(cause, "无法保存佩戴称号，请稍后重试。").description; }
  finally { savingEquip.value = false; }
};
</script>

<template>
  <main class="achievements-page directory-page page-shell">
    <section class="page-intro" aria-labelledby="achievements-title"><h1 id="achievements-title" class="page-title">{{ player ? "我的成就" : "成就" }}</h1></section>
    <section v-if="loading" class="achievement-directory surface-card" aria-label="读取中…" role="status">
      <div class="achievement-skeleton-groups" aria-hidden="true">
        <section v-for="group in 2" :key="group" class="achievement-skeleton-section">
          <div class="achievement-skeleton-heading"><USkeleton class="achievement-skeleton-heading-title" /><USkeleton class="achievement-skeleton-heading-count" /></div>
          <div class="achievement-skeleton-grid directory-grid">
            <article v-for="card in 4" :key="card" class="achievement-skeleton-card">
              <USkeleton class="achievement-skeleton-icon" />
              <div class="achievement-skeleton-copy"><USkeleton class="achievement-skeleton-title" /><USkeleton class="achievement-skeleton-condition" /><USkeleton class="achievement-skeleton-condition achievement-skeleton-condition-short" /></div>
            </article>
          </div>
        </section>
      </div>
    </section>
    <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取成就" :description="error" />
    <template v-else-if="player"><MyAchievementOverview :challenges="challenges" :titles="ownedTitles" :maps="maps" :map-challenges="mapChallenges" :saving-equip="savingEquip" :all-titles="allTitles" @toggle-equipped="updateEquipped" /><UAlert v-if="equipError" class="equip-error" color="error" variant="subtle" :description="equipError" /></template>
    <section v-else class="achievement-directory surface-card" aria-label="成就列表">
      <AchievementCatalog :challenges="challenges" />
    </section>
  </main>
</template>

<style scoped>
.page-intro { margin-bottom: var(--space-8); }
.achievement-directory { padding: clamp(1.375rem, 4vw, 2.25rem); }
.equip-error { margin-top: var(--space-4); }
.achievement-skeleton-groups, .achievement-skeleton-section { display: grid; gap: var(--space-4); }
.achievement-skeleton-section + .achievement-skeleton-section { margin-top: var(--space-8); }
.achievement-skeleton-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-4); }
.achievement-skeleton-heading-title { width: 28%; height: 30px; }
.achievement-skeleton-heading-count { width: 48px; height: 13px; }
.achievement-skeleton-grid { container-type: inline-size; }
.achievement-skeleton-card { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-content: start; gap: var(--space-4); min-height: 124px; padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.achievement-skeleton-icon { width: 58px; height: 58px; border-radius: var(--radius-card); }
.achievement-skeleton-copy { display: grid; align-content: start; gap: var(--space-2); min-width: 0; }
.achievement-skeleton-title { width: 72%; height: 20px; }
.achievement-skeleton-condition { width: 100%; height: 13px; }
.achievement-skeleton-condition-short { width: 76%; }
@media (max-width: 47.99rem) {
  .page-intro { margin-bottom: var(--space-5); }
  .achievement-directory { padding: var(--space-4); }
  .achievement-skeleton-heading { align-items: flex-start; flex-direction: column; gap: var(--space-2); }
  .achievement-skeleton-heading-title { width: 46%; }
}
@container (max-width: 23.99rem) {
  .achievement-skeleton-card { min-height: 0; padding: var(--space-4); }
}
</style>
