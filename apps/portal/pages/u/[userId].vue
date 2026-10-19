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
useSeoMeta({
  title: () => displayName.value ? `${displayName.value} · 躲避堡垒 3` : "玩家 · 躲避堡垒 3",
  robots: () => notFound.value ? "noindex" : undefined,
});
</script>

<template>
  <main class="player-page page-shell--narrow">
    <NuxtLink to="/leaderboard" class="back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />排行榜</NuxtLink>

    <div v-if="profile?.player" class="player-page-card">
      <header class="player-page-head">
        <span class="player-page-avatar font-display" aria-hidden="true">{{ displayName.charAt(0) }}</span>
        <div class="player-page-identity">
          <p class="eyebrow">@{{ profile.handle }}</p>
          <h1 class="player-page-name">{{ displayName }}</h1>
          <span v-if="profile.player.equippedTitle" class="title-pill">{{ profile.player.equippedTitle.label }}</span>
        </div>
      </header>
      <section class="player-page-detail" aria-label="排名与战绩"><LeaderboardPlayerDetail :boards="profile.boards" :summary="profile" /></section>
    </div>
    <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取玩家" :description="portalErrorDetails(error, '请稍后重试。').description">
      <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="() => refresh()" /></template>
    </UAlert>
    <div v-else-if="notFound" class="player-page-missing" role="status">
      <h1>找不到这位玩家。</h1>
    </div>
    <div v-else class="player-page-loading" role="status" aria-label="读取中…"><USkeleton /><USkeleton /></div>
  </main>
</template>

<style scoped>
.player-page { display: grid; gap: var(--space-5); padding-block: var(--space-8) 4.5rem; }
.back-link { display: inline-flex; align-items: center; gap: var(--space-2); justify-self: start; color: var(--muted); font-size: .9rem; text-decoration: none; }
.back-link:hover { color: var(--text); }
.player-page-card { display: grid; gap: var(--space-5); min-width: 0; }
.player-page-head { position: relative; display: flex; align-items: center; gap: var(--space-6); min-width: 0; padding: clamp(var(--space-5), 4vw, var(--space-8)); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sheet); background: radial-gradient(70% 140% at 0% 0%, color-mix(in oklch, var(--accent) 18%, transparent), transparent 60%), linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 2rem 2rem, linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 2rem 2rem, var(--surface); }
.player-page-head::after { position: absolute; top: 0; right: 0; width: 40%; height: 3px; background: linear-gradient(90deg, transparent, var(--accent)); content: ""; }
.player-page-avatar { display: grid; flex: none; place-items: center; width: 6rem; height: 6rem; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: radial-gradient(circle at 50% 30%, color-mix(in oklch, var(--accent) 60%, transparent), transparent 75%), var(--accent-surface); color: var(--accent); font-size: 2.5rem; font-weight: 700; }
.player-page-identity { display: grid; justify-items: start; gap: var(--space-2); min-width: 0; }
.player-page-identity .eyebrow { margin: 0; text-transform: none; letter-spacing: .04em; }
.player-page-name { margin: 0; font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3rem); font-weight: 700; letter-spacing: -.02em; line-height: 1.05; overflow-wrap: anywhere; }
.player-page-detail { min-width: 0; padding: clamp(var(--space-4), 3vw, var(--space-6)); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.player-page-missing h1 { margin: 0; font-family: var(--font-display); font-size: var(--type-section-title-size); }
.player-page-loading { display: grid; gap: var(--space-3); }
.player-page-loading > * { min-height: 96px; border-radius: var(--radius-card); }
.title-pill { display: inline-block; max-width: 100%; padding: 0 var(--space-3); border: 1px solid color-mix(in oklch, var(--accent) 45%, var(--line-strong)); border-radius: var(--radius-control); background: color-mix(in oklch, var(--accent) 10%, var(--surface)); color: var(--text); font-size: var(--type-label-sm-size); font-weight: 600; line-height: 1.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 47.99rem) {
  .player-page { padding-block: var(--space-5) var(--space-12); }
  .player-page-head { gap: var(--space-4); }
  .player-page-avatar { width: 4rem; height: 4rem; font-size: 1.75rem; }
}
</style>
