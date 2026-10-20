<script setup lang="ts">
import type { PublicPlayerProfile } from "@owbastion/contracts";
import { portalErrorDetails } from "~/utils/portal-error";

const route = useRoute();
const api = usePortalApi();
const requestEvent = useRequestEvent();
const userId = computed(() => String(route.params.userId ?? ""));

// An unknown, pending-only, cleared, or non-public handle is the same 404.
const { data: profile, status, error, refresh } = await useAsyncData(
  () => `public-player-${userId.value}`,
  async () => {
    try {
      return await api<PublicPlayerProfile>(`/v1/public/players/${encodeURIComponent(userId.value)}`);
    } catch (cause) {
      if (portalErrorDetails(cause).statusCode === 404) return null;
      throw cause;
    }
  },
  { default: () => null, watch: [userId] },
);

const notFound = computed(() => status.value !== "pending" && !error.value && !profile.value);
if (import.meta.server && notFound.value && requestEvent) setResponseStatus(requestEvent, 404);

const displayName = computed(() => profile.value?.player?.displayName ?? "");
const standings = computed(() => [
  { label: "精通排名", board: profile.value?.boards?.mastery, unit: "XP" },
  { label: "成就排名", board: profile.value?.boards?.achievement, unit: "枚" },
]);
useSeoMeta({
  title: () => displayName.value ? `${displayName.value} · 躲避堡垒 3` : "玩家 · 躲避堡垒 3",
  robots: () => notFound.value ? "noindex" : undefined,
});
</script>

<template>
  <main class="player page-shell--readable">
    <div v-if="profile?.player" class="player__layout">
      <aside class="player__id">
        <span class="player__avatar font-display" aria-hidden="true">{{ displayName.charAt(0) }}</span>
        <div class="player__names">
          <h1 class="player__name">{{ displayName }}</h1>
          <p class="player__handle">@{{ profile.handle }}</p>
        </div>
        <p v-if="profile.player.equippedTitle" class="player__title">
          <AchievementIcon class="player__title-icon" :url="profile.player.equippedTitle.iconUrl" :icon="profile.player.equippedTitle.icon" earned />
          {{ profile.player.equippedTitle.label }}
        </p>
        <dl class="player__ranks">
          <NuxtLink v-for="stat in standings" :key="stat.label" to="/leaderboard" class="player__rank pressable-soft">
            <dt>{{ stat.label }}</dt>
            <dd class="num"><b>{{ stat.board ? `#${stat.board.rank}` : "—" }}</b><span>{{ (stat.board?.score ?? 0).toLocaleString() }} {{ stat.unit }}</span></dd>
          </NuxtLink>
        </dl>
      </aside>

      <div class="player__main">
        <section class="player__section" aria-labelledby="medals-title">
          <h2 id="medals-title" class="player__heading">成就</h2>
          <PlayerMedalCase :titles="profile.titles?.general ?? []" />
        </section>
        <section class="player__section" aria-labelledby="maps-title">
          <h2 id="maps-title" class="player__heading">地图</h2>
          <PlayerMapProgress :per-map-xp="profile.perMapXp ?? []" :titles="profile.titles?.map ?? []" :map-count="profile.mapCount" />
        </section>
      </div>
    </div>
    <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取玩家" :description="portalErrorDetails(error, '请稍后重试。').description">
      <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="() => refresh()" /></template>
    </UAlert>
    <div v-else-if="notFound" class="player__missing" role="status">
      <h1>找不到这位玩家。</h1>
    </div>
    <div v-else class="player__loading" role="status" aria-label="读取中…"><USkeleton /><USkeleton /></div>
  </main>
</template>

<style scoped>
.player { padding-block: clamp(var(--space-8), 6vh, var(--space-12)) 4.5rem; }
.player__layout { display: grid; grid-template-columns: 15rem minmax(0, 1fr); align-items: start; gap: clamp(var(--space-8), 5vw, var(--space-12)); }
.player__id { position: sticky; top: calc(var(--sticky-chrome-top) + var(--space-4)); display: grid; gap: var(--space-5); }
.player__avatar { display: grid; place-items: center; width: 9rem; aspect-ratio: 1; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: radial-gradient(circle at 50% 30%, color-mix(in oklch, var(--accent) 55%, transparent), transparent 72%), var(--accent-surface); color: var(--accent); font-size: 3.5rem; font-weight: 700; }
.player__names { display: grid; gap: var(--space-1); min-width: 0; }
.player__name { margin: 0; font-family: var(--font-display); font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 700; letter-spacing: -.02em; line-height: 1.1; overflow-wrap: anywhere; }
.player__handle { margin: 0; color: var(--quiet); font-size: var(--type-body-sm-size); }
.player__title { --achievement-icon-size: 2rem; display: flex; align-items: center; gap: var(--space-2); margin: 0; font-size: var(--type-label-sm-size); font-weight: 600; }
.player__title-icon { flex: none; }
.player__ranks { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin: 0; }
.player__rank { display: grid; gap: var(--space-1); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: color-mix(in oklch, var(--surface) 80%, transparent); color: inherit; text-decoration: none; }
.player__rank:hover { border-color: var(--line-strong); }
.player__rank dt { color: var(--quiet); font-size: var(--type-caption-size); }
.player__rank dd { display: grid; margin: 0; }
.player__rank b { font-family: var(--font-display); font-size: 1.5rem; line-height: 1.1; }
.player__rank span { color: var(--muted); font-size: var(--type-caption-size); }
.player__main { display: grid; gap: clamp(var(--space-8), 5vw, var(--space-12)); min-width: 0; }
.player__section { display: grid; gap: var(--space-4); }
.player__heading { margin: 0; color: var(--quiet); font-family: var(--font-display); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .14em; }
.player__missing h1 { margin: 0; font-family: var(--font-display); font-size: var(--type-section-title-size); }
.player__loading { display: grid; gap: var(--space-3); }
.player__loading > * { min-height: 96px; border-radius: var(--radius-card); }
@media (max-width: 47.99rem) {
  .player { padding-block: var(--space-6) var(--space-12); }
  .player__layout { grid-template-columns: minmax(0, 1fr); }
  .player__id { position: static; grid-template-columns: 5rem minmax(0, 1fr); align-items: center; gap: var(--space-4); }
  .player__avatar { width: 5rem; font-size: 2rem; }
  .player__title, .player__ranks { grid-column: 1 / -1; }
}
</style>
