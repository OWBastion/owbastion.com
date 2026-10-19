<script setup lang="ts">
import MapDirectorySkeleton from "../components/maps/MapDirectorySkeleton.vue";
import type { Map, MapChallenge } from "~/types/challenge";
import type { OwnedTitle } from "~/types/title";
import MapDirectory from "../components/maps/MapDirectory.vue";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({ title: "地图 · 躲避堡垒 3", description: "查看当前支持的地图与挑战。" });

const { player, refresh } = useCurrentPlayer();
const route = useRoute();
const { data: catalog, pending: loading, error: catalogError } = useAsyncData("public-map-directory", async () => {
  const [mapResponse, challengeResponse] = await Promise.all([
    usePublicCatalog<{ items: Map[] }>("maps"),
    usePublicCatalog<{ items: MapChallenge[] }>("mapChallenges"),
  ]);
  return { maps: mapResponse.items, challenges: challengeResponse.items };
}, { lazy: true });
const maps = computed(() => catalog.value?.maps ?? []);
const challenges = computed(() => catalog.value?.challenges ?? []);
const error = computed(() => catalogError.value ? portalErrorDetails(catalogError.value, "请稍后重试。").description : "");
const { refresh: refreshTitles } = usePlayerTitles();
const titles = shallowRef<OwnedTitle[]>();
const selectedMapId = computed(() => typeof route.query.mapId === "string" ? route.query.mapId : undefined);


onMounted(async () => {
  try { await refresh(); }
  catch { player.value = null; }
  if (!player.value) return;
  try { titles.value = await refreshTitles(); }
  catch { titles.value = undefined; }
});
</script>

<template>
  <main class="maps-page directory-page page-shell">
    <PageMasthead title="地图" />
    <section class="map-directory-panel" aria-label="地图列表">
      <LoadingReveal>
        <MapDirectorySkeleton v-if="loading" role="status" aria-label="读取中…" />
        <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取地图" :description="error" />
        <MapDirectory v-else :maps="maps" :challenges="challenges" :authenticated="Boolean(player)" :titles="titles" :selected-map-id="selectedMapId" />
      </LoadingReveal>
    </section>
  </main>
</template>

<style scoped>
.map-directory-panel { padding: 0; }
</style>
