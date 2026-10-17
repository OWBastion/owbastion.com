<script setup lang="ts">
import type { LeaderboardPlayerSummary } from "@owbastion/contracts";
import { portalErrorDetails } from "~/utils/portal-error";

const route = useRoute();
const api = usePortalApi();
const publicHandle = computed(() => String(route.params.userId ?? ""));
const { data: profile, error, status, refresh } = await useAsyncData(
  () => `public-profile:${publicHandle.value}`,
  () => api<LeaderboardPlayerSummary>(`/v1/public/profiles/${encodeURIComponent(publicHandle.value)}`),
  { watch: [publicHandle] },
);
if (import.meta.server && error.value && (error.value as { statusCode?: number }).statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: "公开主页不存在或未公开" });
}
const name = computed(() => profile.value?.player?.displayName ?? "公开主页");
useSeoMeta({ title: () => `${name.value} · 躲避堡垒 3`, description: "查看玩家公开的地图精通、排行榜成绩与称号。" });
const mastery = computed(() => profile.value?.boards?.mastery);
const achievement = computed(() => profile.value?.boards?.achievement);
const maps = computed(() => profile.value?.perMapXp ?? []);
const titles = computed(() => profile.value?.titles?.general ?? []);
const mapTitles = computed(() => profile.value?.titles?.map ?? []);
</script>

<template>
  <main class="public-player-page page-shell">
    <div v-if="status === 'pending'" class="public-player-loading" role="status" aria-label="读取公开主页中">
      <USkeleton /><USkeleton /><USkeleton />
    </div>
    <section v-else-if="error || !profile?.player" class="public-player-state">
      <h1 class="page-title">公开主页不可用</h1>
      <p class="body-copy">{{ error && (error as { statusCode?: number }).statusCode !== 404 ? portalErrorDetails(error, "读取失败，请稍后重试。").description : "该玩家不存在，或已关闭公开主页。" }}</p>
      <UButton v-if="error && (error as { statusCode?: number }).statusCode !== 404" label="重试" variant="outline" color="neutral" @click="refresh()" />
    </section>
    <template v-else>
      <section class="public-player-hero surface-card elevation-2">
        <span class="public-player-avatar" aria-hidden="true">{{ profile.player.displayName.slice(0, 1) }}</span>
        <div class="public-player-identity">
          <h1 class="page-title">{{ profile.player.displayName }}</h1>
          <p class="public-player-handle">@{{ publicHandle }}</p>
          <p v-if="profile.player.equippedTitle" class="public-player-title">{{ profile.player.equippedTitle.label }}</p>
        </div>
      </section>

      <section class="public-player-section" aria-labelledby="standings-title">
        <PageSectionHeader heading-id="standings-title" title="排行榜成绩" />
        <div class="public-player-stats">
          <div class="public-player-stat surface-card"><strong>{{ mastery ? `#${mastery.rank}` : "—" }}</strong><span>地图精通排名</span><small>{{ (mastery?.score ?? 0).toLocaleString() }} XP</small></div>
          <div class="public-player-stat surface-card"><strong>{{ achievement ? `#${achievement.rank}` : "—" }}</strong><span>成就排名</span><small>{{ achievement?.score ?? 0 }} 个</small></div>
        </div>
      </section>

      <section class="public-player-section" aria-labelledby="maps-title">
        <PageSectionHeader heading-id="maps-title" title="地图精通" :count="`已游玩 ${maps.length} / ${profile.mapCount ?? 0} 张`" />
        <ul v-if="maps.length" class="public-player-list">
          <li v-for="map in maps" :key="map.mapId" class="public-player-row surface-card">
            <div><strong>{{ map.mapName }}</strong><small>{{ map.gameVersion }} · {{ map.runCount }} 次通关</small></div>
            <span class="public-player-value">{{ map.xp.toLocaleString() }} XP</span>
          </li>
        </ul>
        <UEmpty v-else title="暂无公开通关记录" variant="naked" />
      </section>

      <section class="public-player-section" aria-labelledby="titles-title">
        <PageSectionHeader heading-id="titles-title" title="成就收藏" :count="`${titles.length} 个`" />
        <ul v-if="titles.length" class="public-player-titles">
          <li v-for="title in titles" :key="title.titleKey" class="surface-card">{{ title.label }}</li>
        </ul>
        <UEmpty v-else title="暂无公开成就" variant="naked" />
      </section>

      <section v-if="mapTitles.length" class="public-player-section" aria-labelledby="map-titles-title">
        <PageSectionHeader heading-id="map-titles-title" title="地图称号" />
        <ul class="public-player-titles">
          <li v-for="title in mapTitles" :key="`${title.mapId}:${title.titleKey}`" class="surface-card">{{ title.mapName }} · {{ title.label }}</li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.public-player-page { padding-block: clamp(4rem, 9vh, 6.5rem) 4.5rem; }
.public-player-loading { display: grid; gap: var(--space-5); }
.public-player-loading > * { min-height: 6rem; }
.public-player-state { max-width: 36rem; }
.public-player-hero { display: flex; gap: var(--space-5); align-items: center; min-width: 0; padding: clamp(var(--space-5), 4vw, var(--space-8)); background: radial-gradient(120% 140% at 0% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 58%), var(--surface); }
.public-player-avatar { flex: none; display: grid; place-items: center; width: 4.5rem; height: 4.5rem; border: 2px solid var(--accent); border-radius: 50%; color: var(--accent); background: var(--accent-surface); font-weight: 700; font-size: 1.7rem; }
.public-player-identity { min-width: 0; overflow-wrap: anywhere; }
.public-player-identity .page-title { margin: 0; }
.public-player-handle { margin: var(--space-1) 0 0; color: var(--muted); }
.public-player-title { display: inline-block; margin: var(--space-2) 0 0; padding: var(--space-1) var(--space-3); border-radius: var(--radius-pill); border: 1px solid var(--accent); color: var(--text); font-size: var(--type-body-sm-size); }
.public-player-section { margin-top: clamp(var(--space-8), 5vw, var(--space-12)); }
.public-player-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.public-player-stat { display: grid; gap: var(--space-2); padding: var(--space-5); }
.public-player-stat strong { font-size: var(--type-headline-size); }
.public-player-stat span, .public-player-stat small { color: var(--muted); }
.public-player-list, .public-player-titles { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-2); }
.public-player-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-4); }
.public-player-row > div { display: grid; min-width: 0; gap: var(--space-1); }
.public-player-row small { color: var(--quiet); }
.public-player-value { color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; }
.public-player-titles { grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); }
.public-player-titles li { padding: var(--space-4); overflow-wrap: anywhere; }
@media (max-width: 36rem) { .public-player-stats { grid-template-columns: 1fr; } .public-player-avatar { width: 3.5rem; height: 3.5rem; } }
</style>
