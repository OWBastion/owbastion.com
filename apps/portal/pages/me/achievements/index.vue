<script setup lang="ts">
import type { PublicAchievement } from "~/components/AchievementCatalog.vue";
import MyAchievementOverview from "~/components/MyAchievementOverview.vue";
import type { PortalMap } from "~/composables/usePortalApi";
import type { MapProgressChallenge } from "~/utils/map-progress";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "我的成就 · 躲避堡垒 3" });

const { player, refresh } = useCurrentPlayer();
const { items: ownedTitles, allTitles, refresh: refreshTitles, replaceEquipped } = usePlayerTitles();
const { items: challengeProgress, refresh: refreshChallengeProgress } = usePlayerChallengeProgress();
const { data: catalog, pending: loading, error: catalogError } = useAsyncData("my-achievement-directory", async () => {
  const [achievementResponse, mapResponse, mapChallengeResponse] = await Promise.all([
    usePublicCatalog<{ items: PublicAchievement[] }>("achievements"),
    usePublicCatalog<{ items: PortalMap[] }>("maps"),
    usePublicCatalog<{ items: MapProgressChallenge[] }>("mapChallenges"),
  ]);
  return { challenges: achievementResponse.items, maps: mapResponse.items, mapChallenges: mapChallengeResponse.items };
}, { lazy: true });
const challenges = computed(() => catalog.value?.challenges ?? []);
const maps = computed(() => catalog.value?.maps ?? []);
const mapChallenges = computed(() => catalog.value?.mapChallenges ?? []);
const playerError = shallowRef("");
const error = computed(() => catalogError.value
  ? portalErrorDetails(catalogError.value, "无法读取成就，请稍后重试。").description
  : playerError.value);

onMounted(async () => {
  try {
    const currentPlayer = await refresh();
    if (currentPlayer) {
      await Promise.all([refreshTitles(), refreshChallengeProgress()]);
    }
  } catch (cause) {
    playerError.value = portalErrorDetails(cause, "无法读取成就，请稍后重试。").description;
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
    <PageMasthead title="我的成就" />
    <LoadingReveal>
      <AchievementWallSkeleton v-if="loading" role="status" aria-label="读取中…" />
      <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取成就" :description="error" />
      <div v-else-if="player" class="collection-host"><MyAchievementOverview :challenges="challenges" :titles="ownedTitles" :maps="maps" :map-challenges="mapChallenges" :challenge-progress="challengeProgress" :saving-equip="savingEquip" :all-titles="allTitles" @toggle-equipped="updateEquipped" /><UAlert v-if="equipError" class="equip-error" color="error" variant="subtle" :description="equipError" /></div>
    </LoadingReveal>
  </main>
</template>

<style scoped>
.collection-host { container-type: inline-size; }
.equip-error { margin-top: var(--space-4); }
</style>
