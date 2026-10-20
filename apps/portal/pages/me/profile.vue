<script setup lang="ts">
import type { PlayerProfileVisibilityResponse } from "@owbastion/contracts";
import { portalErrorDetails } from "~/utils/portal-error";
import type { CurrentPlayerMasteryResponse, PlayerVerifiedRun, PortalMap } from "~/composables/usePortalApi";
import { formatMasteryDuration } from "~/utils/mastery";
import { buildRunDayGrid } from "~/utils/run-days";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "个人主页 · 躲避堡垒 3" });

const { player, status, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles } = usePlayerTitles();
const { days: activityDays, loading: activityLoading, ready: activityReady, error: activityError, refresh: refreshActivity } = usePlayerActivity();
const api = usePortalApi();

const { data: mapsResponse } = await useAsyncData("profile-maps", () => usePublicCatalog<{ items: PortalMap[] }>("maps"));
const maps = computed(() => mapsResponse.value?.items ?? []);

const loading = shallowRef(true);
const playerError = shallowRef("");
const titlesReady = shallowRef(false);
const retrying = shallowRef(false);
const profiles = shallowRef<CurrentPlayerMasteryResponse["profiles"]>([]);
const recentRuns = shallowRef<PlayerVerifiedRun[]>([]);
const masteryError = shallowRef("");
const masteryReady = shallowRef(false);
const masteryLoading = shallowRef(false);
const masteryRetrying = shallowRef(false);

const equippedTitles = computed(() => titles.value.filter((title) => title.equipped));
const mapNameById = computed(() => new Map(maps.value.map((map) => [map.mapId, map.mapName])));
const currentProfiles = computed(() => profiles.value.filter((profile) => profile.gameplayRevisionLifecycle === "default"));
const totalXp = computed(() => currentProfiles.value.reduce((sum, profile) => sum + profile.totalXp, 0));
const yearRuns = computed(() => buildRunDayGrid(activityDays.value, Date.now()).totalRuns);
const heroStats = computed(() => [
  { label: "精通 XP", value: masteryReady.value ? String(totalXp.value) : "—" },
  { label: "近一年通关", value: activityReady.value ? String(yearRuns.value) : "—", unit: activityReady.value ? "次" : undefined },
]);
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
    recentRuns.value = response.runs.filter((run) => run.status === "active" && run.gameplayRevisionLifecycle === "default").slice(0, 5);
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
  try {
    const [playerResult, titlesResult] = await Promise.allSettled([
      refresh({ force: options.forcePlayer ?? false }),
      refreshTitles(),
    ]);

    if (playerResult.status === "rejected") {
      playerError.value = portalErrorDetails(playerResult.reason, "无法读取玩家信息，请稍后重试。").description;
    }

    titlesReady.value = titlesResult.status === "fulfilled";

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

async function retryMastery() {
  masteryRetrying.value = true;
  try {
    await loadMastery();
  } finally {
    masteryRetrying.value = false;
  }
}

function setVisibility({ publicProfile, hideBattleTag }: PlayerProfileVisibilityResponse) {
  if (player.value) Object.assign(player.value.player, { publicProfile, hideBattleTag });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="profile-page page-shell">
    <template v-if="player">
      <PlayerProfileHero :player-name="player.player.playerName" :player-id="player.player.playerId" :equipped-titles="equippedTitles" :titles-ready="titlesReady" :stats="heroStats">
        <template #settings>
          <UPopover :content="{ align: 'end' }">
            <UButton icon="i-lucide-settings-2" color="neutral" variant="ghost" aria-label="公开设置" />
            <template #content>
              <PlayerProfileVisibilityCard :public-profile="player.player.publicProfile" :hide-battle-tag="player.player.hideBattleTag" @updated="setVisibility">
                <PlayerHandleCard v-if="player.player.publicProfile" />
              </PlayerProfileVisibilityCard>
            </template>
          </UPopover>
        </template>
      </PlayerProfileHero>

      <div class="profile-grid">
        <div class="profile-side">
          <section class="section-block" aria-labelledby="activity-title">
            <h2 id="activity-title" class="section-title">活跃</h2>
            <UAlert v-if="activityError" color="error" variant="subtle" title="无法读取通关记录" :description="activityError" class="profile-alert">
              <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="activityLoading" @click="refreshActivity" /></template>
            </UAlert>
            <div v-else-if="activityPending" class="heatmap-loading" role="status" aria-label="读取通关记录…"><USkeleton /></div>
            <PlayerRunDayHeatmap v-else :days="activityDays" />
          </section>

          <section class="section-block" aria-labelledby="recent-runs-title">
            <h2 id="recent-runs-title" class="section-title">最近通关</h2>
            <UAlert v-if="masteryError" color="error" variant="subtle" title="无法读取通关记录" :description="masteryError" class="profile-alert">
              <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="masteryRetrying" @click="retryMastery" /></template>
            </UAlert>
            <div v-else-if="masteryPending" class="runs-loading" role="status" aria-label="读取通关记录…"><USkeleton /><USkeleton /></div>
            <UEmpty v-else-if="!recentRuns.length" title="暂无通关记录" variant="naked" />
            <ol v-else class="recent-runs">
              <li v-for="run in recentRuns" :key="run.runId">
                <NuxtLink :to="`/me/achievements/maps/${encodeURIComponent(run.mapId)}`" class="recent-run interactive-card pressable-soft" :aria-label="`查看${runMapName(run)}详情`">
                  <div class="recent-run-copy">
                    <strong>{{ runMapName(run) }}<small>{{ run.difficulty }}</small></strong>
                    <span class="num">{{ formatMasteryDuration(run.completionDurationSeconds) }}</span>
                  </div>
                  <strong class="recent-run-xp">{{ run.awardedXp }} XP</strong>
                </NuxtLink>
              </li>
            </ol>
          </section>
        </div>
      </div>

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
      <UButton to="/login" label="去登录" color="primary" />
    </section>
  </main>
</template>

<style scoped>
.profile-page { max-width: 56rem; padding-block: clamp(2rem, 6vh, 4rem) 4.5rem; }
.profile-alert { margin-bottom: var(--space-5); }
.section-title { margin: 0 0 var(--space-4); color: var(--quiet); font-family: var(--font-display); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .14em; }
.map-records { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.map-records > li { min-width: 0; }
.section-block { margin-top: clamp(var(--space-8), 5vw, var(--space-12)); }
.profile-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 var(--space-8); align-items: start; }
.profile-side { display: grid; min-width: 0; }
.heatmap-loading > * { min-height: 9.5rem; border-radius: var(--radius-card); }
.runs-loading { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.runs-loading > * { min-height: 8rem; border-radius: var(--radius-card); }
.recent-runs { container-type: inline-size; display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.recent-runs > li { min-width: 0; }
.recent-run { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-width: 0; padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.recent-run { border-left: 3px solid var(--line-strong); }
.recent-run-copy { display: grid; min-width: 0; gap: var(--space-1); }
.recent-run-copy strong { display: flex; align-items: baseline; gap: var(--space-2); overflow-wrap: anywhere; color: var(--text); font-size: .85rem; }
.recent-run-copy strong small { color: var(--quiet); font-weight: 500; }
.recent-run-copy span { color: var(--quiet); font-size: .73rem; }
.recent-run-xp { flex: 0 0 auto; color: var(--muted); font-size: .8rem; }
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
@media (max-width: 47.99rem) {
  .profile-page { padding-block: var(--space-12); }
  .runs-loading { grid-template-columns: 1fr; }
  .profile-state :deep(button) { width: 100%; justify-content: center; }
}
@container (max-width: 23.99rem) {
  .recent-run { align-items: flex-start; flex-direction: column; gap: var(--space-2); }
}
</style>
