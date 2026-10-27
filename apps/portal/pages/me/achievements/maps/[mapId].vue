<script setup lang="ts">
import MasteryRunHistory from "~/components/maps/MasteryRunHistory.vue";
import type { PortalMap } from "~/composables/usePortalApi";
import { buildMapProgressRows, type MapProgressChallenge } from "~/utils/map-progress";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: "auth" });

const route = useRoute();
const mapId = computed(() => String(route.params.mapId ?? ""));
const { player, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles, refreshMapTitleWear } = usePlayerTitles();
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
  ? buildMapProgressRows({ maps: [map.value], challenges: catalog.value?.challenges ?? [], titles: titles.value })[0] ?? null
  : null);
const profile = computed(() => profiles.value.find((item) => item.mapId === mapId.value) ?? null);
const historyForMap = computed(() => historyMapId.value === mapId.value ? history.value : null);
const hasHistory = computed(() => Boolean(historyForMap.value?.total) || historyLoading.value || Boolean(historyError.value));
const error = computed(() => catalogError.value ? portalErrorDetails(catalogError.value, "无法读取地图成就，请稍后重试。").description : playerError.value);
const earnedIds = computed(() => new Set(row.value?.earnedChallenges.map((challenge) => challenge.challengeId) ?? []));
useSeoMeta({ title: () => `${map.value?.mapName ?? "地图成就"} · 我的成就 · 躲避堡垒 3` });

async function loadPlayerData() {
  playerError.value = "";
  try {
    if (!(await refresh())) return;
    await Promise.all([refreshTitles(), refreshMapTitleWear(), refreshOverview(), loadHistory({ mapId: mapId.value })]);
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
      <header class="map-hero">
        <span class="map-hero__initial font-display" aria-hidden="true">{{ map.mapName.slice(0, 1) }}</span>
        <div class="map-hero__copy">
          <h1 class="map-hero__title">{{ map.mapName }}</h1>
          <div class="map-hero__actions">
            <NuxtLink :to="`/maps?mapId=${encodeURIComponent(map.mapId)}`" class="map-hero__link">地图介绍<UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink>
            <UPopover :content="{ align: 'start' }">
              <UButton icon="i-lucide-settings-2" color="neutral" variant="ghost" size="xs" aria-label="地图称号设置" />
              <template #content><PlayerMapTitleWearCard /></template>
            </UPopover>
          </div>
        </div>
        <div class="map-hero__stats">
          <MastheadStat label="精通 XP" :value="profile ? profile.totalXp : overviewLoading ? null : 0" />
          <MastheadStat label="地图成就" :value="row ? `${row.earnedChallenges.length}/${row.challenges.length}` : null" />
        </div>
      </header>

      <div class="map-achievement-grid">
        <section class="map-panel" aria-labelledby="map-challenges-title">
          <h2 id="map-challenges-title" class="map-panel__title">地图成就</h2>
          <ul v-if="row?.challenges.length" class="map-challenge-list">
            <li v-for="challenge in row.challenges" :key="challenge.challengeId" :class="{ earned: earnedIds.has(challenge.challengeId) }">
              <span class="map-challenge-list__mark" aria-hidden="true"><UIcon :name="earnedIds.has(challenge.challengeId) ? 'i-lucide-check' : 'i-lucide-lock'" /></span>
              <span class="map-challenge-list__name">{{ challenge.name }}<small v-if="challenge.status === 'sunsetting'">即将结束</small></span>
            </li>
          </ul>
          <p v-else class="map-panel__empty">暂无</p>
        </section>

        <div class="map-panel map-panel--mastery">
          <MapMasteryCard
            variant="detail"
            :authenticated="Boolean(player)"
            :profile="profile"
            :loading="overviewLoading"
            :error="overviewError && !historyForMap ? overviewError : ''"
            @retry="refreshOverview"
          >
            <MasteryRunHistory v-if="profile || hasHistory" :map-name="map.mapName" :history="historyForMap" :loading="historyLoading" :error="historyError" @change-page="changeHistoryPage" @retry="() => loadHistory({ mapId })" />
          </MapMasteryCard>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.map-achievement-page { display: grid; gap: var(--space-6); padding-block: var(--space-8) 4.5rem; }
.map-hero { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-6); padding: clamp(var(--space-5), 4vw, var(--space-8)); border: 1px solid var(--line); border-radius: var(--radius-sheet); background: radial-gradient(70% 140% at 0% 100%, color-mix(in oklch, var(--accent) 14%, transparent), transparent 70%), var(--surface); }
.map-hero__initial { display: grid; width: 5.5rem; height: 5.5rem; place-items: center; border-radius: var(--radius-card); background: var(--accent); color: var(--on-accent); font-size: 2.75rem; font-weight: 700; }
.map-hero__copy { display: grid; gap: var(--space-2); min-width: 0; }
.map-hero__copy .eyebrow { margin: 0; }
.map-hero__title { margin: 0; overflow-wrap: anywhere; font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3.25rem); font-weight: 700; letter-spacing: -.02em; line-height: 1.05; }
.map-hero__actions { display: flex; align-items: center; gap: var(--space-2); }
.map-hero__link { display: inline-flex; align-items: center; gap: var(--space-1); width: fit-content; color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; text-decoration: none; }
.map-hero__link:hover { text-decoration: underline; }
.map-hero__stats { display: flex; gap: var(--space-2); }
.map-achievement-grid { display: grid; grid-template-columns: minmax(0, 20rem) minmax(0, 1fr); align-items: start; gap: var(--space-5); }
.map-panel { display: grid; gap: var(--space-4); min-width: 0; padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.map-panel__title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.map-panel__empty { margin: 0; color: var(--muted); font-size: var(--type-body-sm-size); }
.map-challenge-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.map-challenge-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); color: var(--muted); }
.map-challenge-list__mark { display: grid; width: 2rem; height: 2rem; place-items: center; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: var(--surface-raised); color: var(--quiet); }
.map-challenge-list__name { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.map-challenge-list__name small { display: block; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.map-challenge-list li.earned { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--text); }
.map-challenge-list li.earned .map-challenge-list__mark { background: var(--accent); color: var(--on-accent); }
.map-achievement-loading { display: grid; gap: var(--space-3); }
@media (max-width: 63.99rem) { .map-achievement-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 47.99rem) {
  .map-achievement-page { padding-block: var(--space-5) var(--space-12); }
  .map-hero { grid-template-columns: auto minmax(0, 1fr); }
  .map-hero__initial { width: 3.5rem; height: 3.5rem; font-size: 1.75rem; }
  .map-hero__stats { grid-column: 1 / -1; }
  .map-hero__stats > * { flex: 1; }
  .map-panel { padding: var(--space-4); }
}
</style>
