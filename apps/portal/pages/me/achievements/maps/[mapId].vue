<script setup lang="ts">
import MapMasteryProfile from "~/components/maps/MapMasteryProfile.vue";
import type { PortalMap } from "~/composables/usePortalApi";
import { buildMapProgressRows, type MapProgressChallenge } from "~/utils/map-progress";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: "auth" });

const route = useRoute();
const mapId = computed(() => String(route.params.mapId ?? ""));
const { player, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles } = usePlayerTitles();
const { profiles, overviewLoading, overviewError, refreshOverview, history, historyMapId, historyLoading, historyError, loadHistory } = usePlayerMastery();

const { data: catalog, pending: catalogLoading, error: catalogError } = await useAsyncData(() => `me-map-achievements:${mapId.value}`, async () => {
  const [mapResponse, challengeResponse] = await Promise.all([
    usePublicCatalog<{ items: PortalMap[] }>("maps"),
    usePublicCatalog<{ items: MapProgressChallenge[] }>("mapChallenges"),
  ]);
  return { maps: mapResponse.items, challenges: challengeResponse.items };
}, { watch: [mapId] });

const playerError = shallowRef("");
const map = computed(() => catalog.value?.maps.find((item) => item.mapId === mapId.value) ?? null);
const row = computed(() => map.value
  ? buildMapProgressRows({ maps: [map.value], challenges: catalog.value?.challenges ?? [], titles: titles.value, profiles: profiles.value })[0] ?? null
  : null);
const profile = computed(() => profiles.value.find((item) => item.mapId === mapId.value) ?? null);
const historyForMap = computed(() => historyMapId.value === mapId.value ? history.value : null);
const error = computed(() => catalogError.value ? portalErrorDetails(catalogError.value, "无法读取地图成就，请稍后重试。").description : playerError.value);
const earnedIds = computed(() => new Set(row.value?.earnedChallenges.map((challenge) => challenge.challengeId) ?? []));
useSeoMeta({ title: () => `${map.value?.mapName ?? "地图成就"} · 我的成就 · 躲避堡垒 3` });

async function loadPlayerData() {
  playerError.value = "";
  try {
    if (!(await refresh())) return;
    await Promise.all([refreshTitles(), refreshOverview(), loadHistory({ mapId: mapId.value })]);
  } catch (cause) {
    playerError.value = portalErrorDetails(cause, "无法读取地图成就，请稍后重试。").description;
  }
}
const changeHistoryPage = (page: number) => { void loadHistory({ mapId: mapId.value, page }); };

onMounted(loadPlayerData);
watch(mapId, () => { void loadPlayerData(); });
</script>

<template>
  <main class="map-achievement-page page-shell">
    <NuxtLink to="/me/achievements" class="back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />我的成就</NuxtLink>

    <UAlert v-if="error" color="error" variant="subtle" title="无法读取地图成就" :description="error" />
    <div v-else-if="catalogLoading" class="map-achievement-loading" role="status" aria-label="读取中…"><USkeleton /><USkeleton /></div>
    <UEmpty v-else-if="!map" title="没有找到这张地图" variant="naked" />
    <template v-else>
      <h1 class="page-title">{{ map.mapName }}</h1>

      <section class="map-achievement-section surface-card" aria-labelledby="map-challenges-title">
        <h2 id="map-challenges-title" class="section-title">地图成就</h2>
        <p v-if="row" class="body-copy">已获得 {{ row.earnedChallenges.length }} / {{ row.challenges.length }}</p>
        <ul v-if="row?.challenges.length" class="map-challenge-list">
          <li v-for="challenge in row.challenges" :key="challenge.challengeId" :class="{ earned: earnedIds.has(challenge.challengeId) }">
            <span aria-hidden="true">{{ earnedIds.has(challenge.challengeId) ? "✓" : "○" }}</span>
            <span>{{ challenge.name }}<small v-if="challenge.status === 'sunsetting'">即将结束</small></span>
            <span class="sr-only">{{ earnedIds.has(challenge.challengeId) ? "已获得" : "未获得" }}</span>
          </li>
        </ul>
        <UEmpty v-else title="这张地图暂无成就" variant="naked" />
      </section>

      <section class="map-achievement-section surface-card">
        <MapMasteryProfile
          :map-name="map.mapName"
          :authenticated="Boolean(player)"
          :profile="profile"
          :loading="overviewLoading"
          :error="overviewError"
          :history="historyForMap"
          :history-loading="historyLoading"
          :history-error="historyError"
          @retry="refreshOverview"
          @history-page="changeHistoryPage"
          @retry-history="() => loadHistory({ mapId })"
        />
      </section>

      <p class="body-copy"><NuxtLink :to="`/maps?mapId=${encodeURIComponent(map.mapId)}`">查看地图介绍与评价</NuxtLink></p>
    </template>
  </main>
</template>

<style scoped>
.map-achievement-page { display: grid; gap: var(--space-5); }
.map-achievement-section { display: grid; gap: var(--space-3); padding: clamp(var(--space-4), 3vw, var(--space-6)); }
.map-challenge-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.map-challenge-list li { display: flex; align-items: baseline; gap: var(--space-2); color: var(--muted); }
.map-challenge-list li.earned { color: var(--text); }
.map-challenge-list small { margin-left: var(--space-2); color: var(--quiet); }
.map-achievement-loading { display: grid; gap: var(--space-3); }
</style>
