<script setup lang="ts">
import type { Map, MapChallenge } from "../composables/useSubmissionUpload";
import MapDirectory from "../components/maps/MapDirectory.vue";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({ title: "地图 · 躲避堡垒 3", description: "查看当前支持的地图与挑战。" });

const api = usePortalApi();
const { player, refresh } = useCurrentPlayer();
const maps = ref<Map[]>([]);
const challenges = ref<MapChallenge[]>([]);
const loading = shallowRef(true);
const error = shallowRef("");

onMounted(async () => {
  const [mapResult, challengeResult, playerResult] = await Promise.allSettled([
    api<{ items: Map[] }>("/v1/maps"),
    api<{ items: MapChallenge[] }>("/v1/challenges?family=map"),
    refresh(),
  ]);
  if (mapResult.status === "fulfilled") maps.value = mapResult.value.items;
  if (challengeResult.status === "fulfilled") challenges.value = challengeResult.value.items;
  if (playerResult.status === "rejected") player.value = null;
  const failed = [mapResult, challengeResult].find((result) => result.status === "rejected");
  error.value = failed?.status === "rejected" ? portalErrorDetails(failed.reason, "请稍后重试。").description : "";
  loading.value = false;
});
</script>

<template>
  <main class="maps-page page-shell">
    <section class="page-intro" aria-labelledby="maps-title"><h1 id="maps-title" class="page-title">地图</h1><p class="body-copy">查看当前支持的地图与挑战记录。</p></section>
    <section class="map-directory-panel surface-card" aria-label="地图列表">
      <p v-if="loading" class="directory-state" role="status">读取中…</p>
      <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取地图" :description="error" />
      <MapDirectory v-else :maps="maps" :challenges="challenges" :authenticated="Boolean(player)" />
    </section>
  </main>
</template>

<style scoped>
.maps-page { padding-block: clamp(64px, 9vh, 104px) 72px; }.page-intro { max-width: 690px; margin-bottom: 32px; }.page-intro .eyebrow { margin-bottom: .8rem; }.map-directory-panel { padding: clamp(18px, 4vw, 36px); }.directory-state { margin: 0; padding: 110px 0; color: var(--muted); text-align: center; }
@media (max-width: 620px) { .maps-page { padding-block: 48px 48px; }.page-intro { margin-bottom: 20px; }.map-directory-panel { padding: 14px; } }
@media (max-width: 360px) { .maps-page { padding-block: 44px 40px; }.map-directory-panel { padding: 10px; } }
</style>
