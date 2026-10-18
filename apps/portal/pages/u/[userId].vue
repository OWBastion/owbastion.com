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
      <div class="player-page-head">
        <span class="player-page-avatar" aria-hidden="true">{{ displayName.charAt(0) }}</span>
        <div class="player-page-identity">
          <h1 class="player-page-name">{{ displayName }}</h1>
          <span v-if="profile.player.equippedTitle" class="title-pill">{{ profile.player.equippedTitle.label }}</span>
          <span class="player-page-id">{{ profile.handle }}</span>
        </div>
      </div>
      <LeaderboardPlayerDetail :boards="profile.boards" :summary="profile" />
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
.player-page { display: grid; gap: var(--space-6); padding-block: clamp(4rem, 9vh, 6.5rem) 4.5rem; }
.back-link { display: inline-flex; align-items: center; gap: var(--space-2); justify-self: start; color: var(--muted); font-size: .9rem; text-decoration: none; }
.back-link:hover { color: var(--text); }
.player-page-card { display: grid; gap: var(--space-2); min-width: 0; }
.player-page-head { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-5); min-width: 0; }
.player-page-avatar { display: grid; flex: none; place-items: center; width: 4rem; height: 4rem; border: 2px solid var(--accent); border-radius: 50%; background: var(--accent-surface); color: var(--accent); font-size: 1.6rem; font-weight: 700; }
.player-page-identity { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); min-width: 0; }
.player-page-name { flex: 1 0 100%; margin: 0; font-size: var(--type-title-size); font-weight: 700; letter-spacing: var(--type-title-tracking); line-height: var(--type-title-leading); overflow-wrap: anywhere; }
.player-page-id { color: var(--quiet); font-size: var(--type-caption-size); overflow-wrap: anywhere; }
.player-page-missing h1 { margin: 0; font-size: var(--type-section-title-size); }
.player-page-loading { display: grid; gap: var(--space-3); }
.player-page-loading > * { min-height: 96px; border-radius: var(--radius-card); }
.title-pill { display: inline-block; max-width: 100%; padding: 0 var(--space-2); border: 1px solid color-mix(in oklch, var(--accent) 32%, var(--line-strong)); border-radius: var(--radius-pill); background: color-mix(in oklch, var(--accent) 7%, var(--surface)); color: var(--text); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
@media (max-width: 47.99rem) { .player-page { padding-block: var(--space-12); gap: var(--space-5); } }
</style>
