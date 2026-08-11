<script setup lang="ts">
import type { Map, MapChallenge } from "../composables/useSubmissionUpload";
import MapDirectory from "../components/maps/MapDirectory.vue";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({ title: "地图 · 躲避堡垒 3", description: "查看当前支持的地图与挑战。" });

const api = usePortalApi();
const { player, refresh } = useCurrentPlayer();
const { profiles: masteryProfiles, overviewLoading: masteryLoading, overviewError: masteryError, refreshOverview: refreshMastery, history: masteryHistory, historyMapId, historyLoading: masteryHistoryLoading, historyError: masteryHistoryError, loadHistory: loadMasteryHistory } = usePlayerMastery();
const route = useRoute();
const maps = ref<Map[]>([]);
const challenges = ref<MapChallenge[]>([]);
const loading = shallowRef(true);
const error = shallowRef("");
const selectedMapId = computed(() => typeof route.query.mapId === "string" ? route.query.mapId : undefined);

const refreshMapMastery = async () => { await refreshMastery(); };
const changeMasteryHistory = async (input: { mapId: string; page: number }) => { await loadMasteryHistory(input); };

onMounted(async () => {
  const [mapResult, challengeResult, playerResult] = await Promise.allSettled([
    api<{ items: Map[] }>("/v1/maps"),
    api<{ items: MapChallenge[] }>("/v1/challenges?family=map"),
    refresh(),
  ]);
  if (mapResult.status === "fulfilled") maps.value = mapResult.value.items;
  if (challengeResult.status === "fulfilled") challenges.value = challengeResult.value.items;
  if (playerResult.status === "rejected") player.value = null;
  if (playerResult.status === "fulfilled" && playerResult.value) void refreshMapMastery();
  const failed = [mapResult, challengeResult].find((result) => result.status === "rejected");
  error.value = failed?.status === "rejected" ? portalErrorDetails(failed.reason, "请稍后重试。").description : "";
  loading.value = false;
});
</script>

<template>
  <main class="maps-page page-shell">
    <section class="page-intro" aria-labelledby="maps-title"><h1 id="maps-title" class="page-title">地图</h1></section>
    <section class="map-directory-panel surface-card" aria-label="地图列表">
      <div v-if="loading" class="map-skeleton-grid" role="status" aria-label="读取中…">
        <div v-for="index in 6" :key="index" class="map-skeleton-card interactive-card interactive-card--static" aria-hidden="true">
          <USkeleton class="map-skeleton-visual" />
          <div class="map-skeleton-body">
            <div class="map-skeleton-heading"><USkeleton class="map-skeleton-title" /><USkeleton class="map-skeleton-version" /></div>
            <div class="map-skeleton-facts"><div class="map-skeleton-fact"><USkeleton class="map-skeleton-label" /><USkeleton class="map-skeleton-value" /></div><div class="map-skeleton-fact"><USkeleton class="map-skeleton-label" /><USkeleton class="map-skeleton-value" /></div><div class="map-skeleton-fact map-skeleton-fact-last"><USkeleton class="map-skeleton-label" /><USkeleton class="map-skeleton-value" /></div></div>
            <div class="map-skeleton-footer"><USkeleton class="map-skeleton-tag" /><USkeleton class="map-skeleton-tag map-skeleton-tag-short" /></div>
          </div>
        </div>
      </div>
      <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取地图" :description="error" />
      <MapDirectory v-else :maps="maps" :challenges="challenges" :authenticated="Boolean(player)" :mastery-profiles="masteryProfiles" :mastery-loading="masteryLoading" :mastery-error="masteryError" :mastery-history="masteryHistory" :mastery-history-map-id="historyMapId" :mastery-history-loading="masteryHistoryLoading" :mastery-history-error="masteryHistoryError" :selected-map-id="selectedMapId" @retry-mastery="refreshMapMastery" @history-page="changeMasteryHistory" />
    </section>
  </main>
</template>

<style scoped>
.maps-page { padding-block: clamp(64px, 9vh, 104px) 72px; }.page-intro { max-width: 690px; margin-bottom: 32px; }.page-intro .eyebrow { margin-bottom: .8rem; }.map-directory-panel { padding: clamp(18px, 4vw, 36px); }
.map-skeleton-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }.map-skeleton-card { display: grid; min-width: 0; overflow: hidden; border-radius: 17px; }.map-skeleton-visual { min-height: 138px; border-radius: 0; }.map-skeleton-body { display: grid; gap: 17px; padding: 18px 18px 16px; }.map-skeleton-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }.map-skeleton-title { width: 58%; height: 24px; }.map-skeleton-version { width: 24%; height: 14px; }.map-skeleton-facts { display: grid; gap: 9px; margin: 0; }.map-skeleton-fact { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 9px; border-top: 1px solid var(--line); }.map-skeleton-label { width: 28%; height: 12px; }.map-skeleton-value { width: 32%; height: 13px; }.map-skeleton-footer { display: flex; flex-wrap: wrap; gap: 6px; }.map-skeleton-tag { width: 52px; height: 20px; border-radius: 999px; }.map-skeleton-tag-short { width: 42px; }
@media (max-width: 620px) { .maps-page { padding-block: 48px 48px; }.page-intro { margin-bottom: 20px; }.map-directory-panel { padding: 14px; } }
@media (max-width: 360px) { .maps-page { padding-block: 44px 40px; }.map-directory-panel { padding: 10px; } }
@media (max-width: 860px) { .map-skeleton-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) { .map-skeleton-visual { min-height: 108px; }.map-skeleton-body { gap: 14px; padding: 14px; }.map-skeleton-heading { align-items: flex-start; flex-direction: column; gap: 5px; }.map-skeleton-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }.map-skeleton-fact { min-width: 0; align-items: flex-start; flex-direction: column; gap: 6px; padding-top: 8px; }.map-skeleton-fact-last { grid-column: 1 / -1; align-items: center; flex-direction: row; }.map-skeleton-label, .map-skeleton-value { max-width: 100%; } }
@media (max-width: 560px) { .map-skeleton-grid { grid-template-columns: 1fr; } }
@media (max-width: 360px) { .map-skeleton-visual { min-height: 96px; }.map-skeleton-body { padding-inline: 12px; }.map-skeleton-footer { display: grid; grid-template-columns: 1fr; } }
</style>
