<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import type { CurrentPlayerMasteryResponse, PlayerVerifiedRun, PortalMap } from "~/composables/usePortalApi";
import { buildMapProgressRows, type MapProgressChallenge } from "~/utils/map-progress";
import { formatMasteryDuration } from "~/utils/mastery";
import { buildRunDayGrid } from "~/utils/run-days";
import type { OwnedTitle } from "~/types/title";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "个人主页 · 躲避堡垒 3" });

const { player, status, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles } = usePlayerTitles();
const { days: activityDays, loading: activityLoading, ready: activityReady, error: activityError, refresh: refreshActivity } = usePlayerActivity();
const api = usePortalApi();

const { data: catalog, error: catalogFetchError, refresh: refreshCatalog } = await useAsyncData("profile-map-catalog", async () => {
  const [mapsResponse, challengesResponse] = await Promise.all([
    usePublicCatalog<{ items: PortalMap[] }>("maps"),
    usePublicCatalog<{ items: MapProgressChallenge[] }>("mapChallenges"),
  ]);
  return { maps: mapsResponse.items, challenges: challengesResponse.items };
});
const maps = computed(() => catalog.value?.maps ?? []);
const challenges = computed(() => catalog.value?.challenges ?? []);
const catalogError = computed(() => catalogFetchError.value ? portalErrorDetails(catalogFetchError.value, "无法读取地图，请稍后重试。").description : "");

const loading = shallowRef(true);
const playerError = shallowRef("");
const titlesError = shallowRef("");
const titlesReady = shallowRef(false);
const retrying = shallowRef(false);
const profiles = shallowRef<CurrentPlayerMasteryResponse["profiles"]>([]);
const recentRuns = shallowRef<PlayerVerifiedRun[]>([]);
const masteryError = shallowRef("");
const masteryReady = shallowRef(false);
const masteryLoading = shallowRef(false);
const masteryRetrying = shallowRef(false);
const catalogRetrying = shallowRef(false);

const progressRows = computed(() => buildMapProgressRows({ maps: maps.value, challenges: challenges.value, titles: titles.value, profiles: [] }));
const challengeStats = computed(() => progressRows.value.reduce((stats, row) => ({ earned: stats.earned + row.earnedChallenges.length, total: stats.total + row.challenges.length }), { earned: 0, total: 0 }));
const equippedTitles = computed(() => titles.value.filter((title) => title.equipped));
const mapNameById = computed(() => new Map(maps.value.map((map) => [map.mapId, map.mapName])));
const currentProfiles = computed(() => profiles.value.filter((profile) => profile.gameplayRevisionLifecycle === "default"));
const totalXp = computed(() => currentProfiles.value.reduce((sum, profile) => sum + profile.totalXp, 0));
const yearRuns = computed(() => buildRunDayGrid(activityDays.value, Date.now()).totalRuns);
const heroStats = computed(() => [
  { label: "称号", value: titlesReady.value ? String(titles.value.length) : "—", unit: titlesReady.value ? "个" : undefined },
  { label: "地图成就", value: titlesReady.value && challengeStats.value.total ? String(challengeStats.value.earned) : "—", unit: titlesReady.value && challengeStats.value.total ? `/ ${challengeStats.value.total}` : undefined },
  { label: "精通 XP", value: masteryReady.value ? String(totalXp.value) : "—" },
  { label: "近一年通关", value: activityReady.value ? String(yearRuns.value) : "—", unit: activityReady.value ? "次" : undefined },
]);
const startedMapIds = computed(() => new Set([
  ...progressRows.value.filter((row) => row.earnedChallenges.length).map((row) => row.map.mapId),
  ...currentProfiles.value.filter((profile) => profile.verifiedRunCount > 0).map((profile) => profile.mapId),
]));
const startedMaps = computed(() => maps.value.filter((map) => startedMapIds.value.has(map.mapId)));
const untouchedMaps = computed(() => maps.value.filter((map) => !startedMapIds.value.has(map.mapId)));
const showUntouched = shallowRef(false);
const inspected = shallowRef<OwnedTitle | null>(null);
const inspectOpen = shallowRef(false);
function inspectTitle(title: OwnedTitle) { inspected.value = title; inspectOpen.value = true; }
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
const runMapName = (run: PlayerVerifiedRun) => mapNameById.value.get(run.mapId) ?? "地图";

const showSkeleton = computed(() => loading.value && !player.value);
const sessionUnavailable = computed(() => !loading.value && !player.value && !playerError.value && status.value === "anonymous");
const playerLoadFailed = computed(() => !loading.value && !player.value && Boolean(playerError.value));
const activityPending = computed(() => activityLoading.value || (!activityReady.value && !activityError.value));
const masteryPending = computed(() => masteryLoading.value || (!masteryReady.value && !masteryError.value));

async function loadMastery() {
  masteryLoading.value = true;
  masteryError.value = "";
  try {
    const response = await api<CurrentPlayerMasteryResponse>("/v1/me/mastery?page=1&pageSize=10");
    profiles.value = response.profiles;
    // 最近通关只展示当前默认版本的有效记录；历史/可选版本与已失效记录
    // 不属于本页“当前进度”边界，全部交由地图详情页的完整历史承载。
    recentRuns.value = response.runs.filter((run) => run.status === "active" && run.gameplayRevisionLifecycle === "default");
    masteryReady.value = true;
  } catch (cause) {
    masteryReady.value = false;
    masteryError.value = portalErrorDetails(cause, "无法读取通关记录，请稍后重试。").description;
  } finally {
    masteryLoading.value = false;
  }
}

async function load(options: { forcePlayer?: boolean } = {}) {
  loading.value = true;
  playerError.value = "";
  titlesError.value = "";
  try {
    const [playerResult, titlesResult] = await Promise.allSettled([
      refresh({ force: options.forcePlayer ?? false }),
      refreshTitles(),
    ]);

    if (playerResult.status === "rejected") {
      playerError.value = portalErrorDetails(playerResult.reason, "无法读取玩家信息，请稍后重试。").description;
    }

    if (titlesResult.status === "fulfilled") {
      titlesReady.value = true;
    } else {
      titlesReady.value = false;
      titlesError.value = portalErrorDetails(titlesResult.reason, "无法读取称号，请稍后重试。").description;
    }

    if (playerResult.status === "fulfilled" && playerResult.value) {
      void refreshActivity();
      void loadMastery();
    }
  } finally {
    loading.value = false;
  }
}

async function retryAll() {
  retrying.value = true;
  try {
    await load({ forcePlayer: true });
  } finally {
    retrying.value = false;
  }
}

async function retryTitles() {
  titlesError.value = "";
  retrying.value = true;
  try {
    await refreshTitles();
    titlesReady.value = true;
  } catch (cause) {
    titlesReady.value = false;
    titlesError.value = portalErrorDetails(cause, "无法读取称号，请稍后重试。").description;
  } finally {
    retrying.value = false;
  }
}

async function retryMastery() {
  masteryRetrying.value = true;
  try {
    await loadMastery();
  } finally {
    masteryRetrying.value = false;
  }
}

async function retryCatalog() {
  catalogRetrying.value = true;
  try {
    await refreshCatalog();
  } finally {
    catalogRetrying.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="profile-page page-shell">
    <template v-if="player">
      <PlayerProfileHero :player-name="player.player.playerName" :player-id="player.player.playerId" :equipped-titles="equippedTitles" :titles-ready="titlesReady" :stats="heroStats" @inspect="inspectTitle" />

      <section v-if="currentProfiles.length" class="section-block" aria-labelledby="records-title">
        <PageSectionHeader title="战绩" heading-id="records-title" count="每张地图的个人最佳" />
        <PlayerMapRecords :profiles="profiles" :map-names="mapNameById" />
      </section>

      <div class="profile-grid">
        <section class="section-block" aria-labelledby="titles-title">
          <PageSectionHeader title="称号收藏" heading-id="titles-title">
            <template #actions><UButton to="/achievements" label="查看全部成就" color="neutral" variant="outline" /></template>
          </PageSectionHeader>
          <UAlert v-if="titlesError" color="error" variant="subtle" title="无法读取称号" :description="titlesError" class="profile-alert">
            <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="retrying" @click="retryTitles" /></template>
          </UAlert>
          <PlayerTitleShelf v-else-if="titlesReady && titles.length" :titles="titles" @inspect="inspectTitle" />
          <UEmpty v-else-if="titlesReady" title="暂无称号" variant="naked" />
          <div v-else class="title-loading" role="status" aria-label="读取中…">
            <USkeleton v-for="card in 3" :key="card" class="title-loading-card" />
          </div>
        </section>

        <div class="profile-side">
          <section class="section-block" aria-labelledby="activity-title">
            <PageSectionHeader title="活跃日历" heading-id="activity-title" />
            <UAlert v-if="activityError" color="error" variant="subtle" title="无法读取通关记录" :description="activityError" class="profile-alert">
              <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="activityLoading" @click="refreshActivity" /></template>
            </UAlert>
            <div v-else-if="activityPending" class="heatmap-loading" role="status" aria-label="读取通关记录…"><USkeleton /></div>
            <PlayerRunDayHeatmap v-else :days="activityDays" />
          </section>

          <section class="section-block" aria-labelledby="recent-runs-title">
            <PageSectionHeader title="最近通关" heading-id="recent-runs-title" />
            <UAlert v-if="masteryError" color="error" variant="subtle" title="无法读取通关记录" :description="masteryError" class="profile-alert">
              <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="masteryRetrying" @click="retryMastery" /></template>
            </UAlert>
            <div v-else-if="masteryPending" class="runs-loading" role="status" aria-label="读取通关记录…"><USkeleton /><USkeleton /></div>
            <UEmpty v-else-if="!recentRuns.length" title="暂无通关记录" variant="naked" />
            <ol v-else class="recent-runs">
              <li v-for="run in recentRuns" :key="run.runId">
                <NuxtLink :to="`/maps?mapId=${encodeURIComponent(run.mapId)}`" class="recent-run interactive-card pressable-soft" :aria-label="`查看${runMapName(run)}详情`">
                  <div class="recent-run-copy">
                    <strong>{{ runMapName(run) }} · {{ run.difficulty }}</strong>
                    <span><time :datetime="new Date(run.acceptedAt).toISOString()">{{ formatDate(run.acceptedAt) }}</time> · {{ formatMasteryDuration(run.completionDurationSeconds) }}</span>
                  </div>
                  <strong class="recent-run-xp">{{ run.awardedXp }} XP</strong>
                </NuxtLink>
              </li>
            </ol>
          </section>
        </div>
      </div>

      <section class="section-block" aria-labelledby="map-progress-title">
        <PageSectionHeader title="地图进度" heading-id="map-progress-title">
          <template #actions><UButton to="/maps" label="查看地图" color="neutral" variant="outline" /></template>
        </PageSectionHeader>
        <UAlert v-if="catalogError" color="error" variant="subtle" title="无法读取地图" :description="catalogError" class="profile-alert">
          <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="catalogRetrying" @click="retryCatalog" /></template>
        </UAlert>
        <UAlert v-if="masteryError" color="error" variant="subtle" title="无法读取精通记录" :description="masteryError" class="profile-alert">
          <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="masteryRetrying" @click="retryMastery" /></template>
        </UAlert>
        <div v-if="masteryPending" class="mastery-loading" role="status" aria-label="读取地图进度…"><USkeleton /><USkeleton /></div>
        <template v-else-if="!catalogError">
          <PlayerMapProgressOverview
            v-if="startedMaps.length"
            :maps="startedMaps"
            :challenges="challenges"
            :titles="titles"
            :profiles="profiles"
            show-targets
            :show-mastery-facts="!masteryError"
            :title-progress-available="titlesReady"
          />
          <UEmpty v-else-if="!untouchedMaps.length" title="暂无地图" variant="naked" />
          <UCollapsible v-if="untouchedMaps.length" v-model:open="showUntouched" class="untouched">
            <UButton :label="startedMaps.length ? `还有 ${untouchedMaps.length} 张地图没有记录` : `${untouchedMaps.length} 张地图还没有记录`" color="neutral" variant="outline" trailing-icon="i-lucide-chevron-down" block />
            <template #content>
              <PlayerMapProgressOverview
                class="untouched-list"
                :maps="untouchedMaps"
                :challenges="challenges"
                :titles="titles"
                :profiles="profiles"
                show-targets
                :show-mastery-facts="!masteryError"
                :title-progress-available="titlesReady"
              />
            </template>
          </UCollapsible>
        </template>
      </section>

      <PlayerTitleInspectDialog v-model:open="inspectOpen" :title="inspected" />
    </template>

    <div v-else-if="showSkeleton" class="profile-skeleton" role="status" aria-label="读取中…">
      <section class="profile-skeleton-hero" aria-hidden="true">
        <USkeleton class="profile-skeleton-avatar" />
        <div class="profile-skeleton-hero-copy">
          <USkeleton class="profile-skeleton-name" />
          <USkeleton class="profile-skeleton-badges" />
        </div>
      </section>
      <section v-for="section in 4" :key="section" class="profile-skeleton-section" aria-hidden="true">
        <USkeleton class="profile-skeleton-title" />
        <USkeleton class="profile-skeleton-body" />
      </section>
    </div>

    <section v-else-if="playerLoadFailed" class="profile-state surface-card" aria-labelledby="profile-error-title">
      <h1 id="profile-error-title" class="page-title">无法读取玩家信息</h1>
      <p class="body-copy">{{ playerError }}</p>
      <UButton label="重试" color="primary" :loading="retrying" @click="retryAll" />
    </section>

    <section v-else-if="sessionUnavailable" class="profile-state surface-card" aria-labelledby="profile-session-title">
      <h1 id="profile-session-title" class="page-title">需要登录</h1>
      <p class="body-copy">当前会话不可用。</p>
      <UButton to="/login" label="去登录" color="primary" />
    </section>
  </main>
</template>

<style scoped>
.profile-page { padding-block: clamp(4rem, 9vh, 6.5rem) 4.5rem; }
.profile-alert { margin-bottom: var(--space-5); }
.section-block { margin-top: clamp(var(--space-8), 5vw, var(--space-12)); }
.profile-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 var(--space-8); align-items: start; }
.profile-side { display: grid; min-width: 0; }
.untouched { margin-top: var(--space-4); }
.untouched-list { margin-top: var(--space-4); }
.heatmap-loading > * { min-height: 9.5rem; border-radius: var(--radius-card); }
.title-loading { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.title-loading-card { min-height: 5.5rem; border-radius: var(--radius-card); }
.mastery-loading, .runs-loading { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.mastery-loading > *, .runs-loading > * { min-height: 8rem; border-radius: var(--radius-card); }
.recent-runs { container-type: inline-size; display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.recent-runs > li { min-width: 0; }
.recent-run { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-width: 0; padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.recent-run-copy { display: grid; min-width: 0; gap: var(--space-1); }
.recent-run-copy strong { overflow-wrap: anywhere; color: var(--text); font-size: .85rem; }
.recent-run-copy span { color: var(--quiet); font-size: .73rem; }
.recent-run-xp { flex: 0 0 auto; color: var(--accent); font-size: .8rem; }
.profile-state { display: grid; gap: var(--space-4); justify-items: start; max-width: 40rem; padding: clamp(var(--space-6), 5vw, var(--space-8)); }
.profile-state .body-copy { margin: 0; }
.profile-skeleton { display: grid; }
.profile-skeleton-hero { display: flex; align-items: center; gap: var(--space-4); }
.profile-skeleton-avatar { width: 3.5rem; height: 3.5rem; border-radius: 50%; }
.profile-skeleton-hero-copy { display: grid; flex: 1; gap: var(--space-2); min-width: 0; }
.profile-skeleton-name { width: min(50%, 18rem); height: 2.25rem; }
.profile-skeleton-badges { width: min(36%, 12rem); height: 1.25rem; }
.profile-skeleton-section { display: grid; gap: var(--space-4); margin-top: clamp(var(--space-8), 5vw, var(--space-12)); }
.profile-skeleton-title { width: 9rem; height: 1.4rem; }
.profile-skeleton-body { min-height: 7rem; border-radius: var(--radius-card); }
@media (min-width: 64rem) {
  .profile-grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
}
@media (max-width: 47.99rem) {
  .profile-page { padding-block: var(--space-12); }
  .title-loading, .mastery-loading, .runs-loading { grid-template-columns: 1fr; }
  .profile-state :deep(button) { width: 100%; justify-content: center; }
}
@container (max-width: 23.99rem) {
  .recent-run { align-items: flex-start; flex-direction: column; gap: var(--space-2); }
}
</style>
