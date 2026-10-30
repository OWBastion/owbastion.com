<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { playerSubmissionStatusLabel } from "~/utils/submissionStatus";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "玩家中心 · 躲避堡垒 3" });

const { player, status, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles } = usePlayerTitles();
const api = usePortalApi();
const { profiles: masteryProfiles, overviewLoading: masteryLoading, overviewError: masteryError, refreshOverview: refreshMastery } = usePlayerMastery();

const loading = shallowRef(true);
const passkeyNudgeKey = "owbastion-passkey-nudge-dismissed";
const showPasskeyNudge = shallowRef(false);
const playerError = shallowRef("");
const titlesReady = shallowRef(false);
const retrying = shallowRef(false);

const equippedTitle = computed(() => titles.value.find((title) => title.equipped) ?? null);
const currentProfiles = computed(() => masteryProfiles.value.filter((profile) => profile.gameplayRevisionLifecycle === "default"));
const masteryReady = computed(() => !masteryLoading.value && !masteryError.value);
const totalXp = computed(() => currentProfiles.value.reduce((sum, profile) => sum + profile.totalXp, 0));
const totalRuns = computed(() => currentProfiles.value.reduce((sum, profile) => sum + profile.verifiedRunCount, 0));
// Only a rejection that asks for a new upload needs the player; it replaces the upload button as the page's one action.
const needsAttention = computed(() => (player.value?.recentSubmissions ?? []).find((submission) => submission.status === "rejected" && submission.resubmissionRequired) ?? null);
const recentSubmissions = computed(() => (player.value?.recentSubmissions ?? []).slice(0, 3));
const showSkeleton = computed(() => loading.value && !player.value);
const sessionUnavailable = computed(() => !loading.value && !player.value && !playerError.value && status.value === "anonymous");
const playerLoadFailed = computed(() => !loading.value && !player.value && Boolean(playerError.value));

async function load(options: { forcePlayer?: boolean } = {}) {
  loading.value = true;
  playerError.value = "";
  try {
    const [playerResult, titlesResult] = await Promise.allSettled([refresh({ force: options.forcePlayer ?? false }), refreshTitles()]);
    if (playerResult.status === "rejected") playerError.value = portalErrorDetails(playerResult.reason, "无法读取玩家信息，请稍后重试。").description;
    titlesReady.value = titlesResult.status === "fulfilled";
    if (playerResult.status === "fulfilled" && playerResult.value) void refreshMastery();
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

async function checkPasskeyNudge() {
  try {
    if (localStorage.getItem(passkeyNudgeKey)) return;
    const response = await api<{ items: unknown[] }>("/v1/me/passkeys");
    showPasskeyNudge.value = response.items.length === 0;
  } catch {
    showPasskeyNudge.value = false;
  }
}

function dismissPasskeyNudge() {
  showPasskeyNudge.value = false;
  try { localStorage.setItem(passkeyNudgeKey, "1"); } catch { /* the reminder may reappear; nothing depends on it */ }
}

onMounted(() => {
  void load();
  void checkPasskeyNudge();
});
</script>

<template>
  <main class="hub page-shell">
    <template v-if="player">
      <header class="hub-hero" aria-labelledby="dashboard-title">
        <div class="hub-hero__id">
          <h1 id="dashboard-title" class="hub-hero__name">{{ player.player.playerName }}</h1>
          <p v-if="equippedTitle" class="hub-hero__title"><PlayerTitleMark :title="equippedTitle" />{{ equippedTitle.label }}</p>
        </div>
        <NuxtLink to="/me/achievements" class="hub-hero__xp" aria-label="我的成就">
          <strong class="num">{{ masteryReady ? totalXp : "—" }}</strong>
          <span>XP</span>
          <small class="num">{{ masteryReady ? totalRuns : "—" }} 通关 · {{ titlesReady ? titles.length : "—" }} 称号</small>
        </NuxtLink>
      </header>

      <UAlert v-if="playerError" color="warning" variant="subtle" :title="playerError">
        <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="retrying" @click="retryAll" /></template>
      </UAlert>

      <NuxtLink v-if="needsAttention" :to="`/me/submissions/${needsAttention.submissionId}`" class="hub-cta hub-cta--warn">
        <UIcon name="i-lucide-triangle-alert" aria-hidden="true" />
        <span>{{ needsAttention.mapName }} · {{ playerSubmissionStatusLabel(needsAttention.status, needsAttention.resubmissionRequired) }}</span>
        <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
      </NuxtLink>
      <NuxtLink v-else to="/me/submissions/new" class="hub-cta">
        <UIcon name="i-lucide-upload" aria-hidden="true" />
        <span>提交截图</span>
        <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
      </NuxtLink>

      <section v-if="recentSubmissions.length" class="hub-recent" aria-labelledby="recent-title">
        <h2 id="recent-title" class="hub-recent__title">最近</h2>
        <PlayerRecentSubmissions :submissions="recentSubmissions" />
        <NuxtLink to="/me/submissions" class="hub-recent__all">全部提交记录<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
      </section>

      <p v-if="showPasskeyNudge" class="hub-nudge">
        <NuxtLink to="/me/settings"><UIcon name="i-lucide-fingerprint" aria-hidden="true" />添加 Passkey，一键登录</NuxtLink>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="不再提醒" @click="dismissPasskeyNudge" />
      </p>
    </template>

    <div v-else-if="showSkeleton" class="hub-skeleton" role="status" aria-label="读取中…">
      <USkeleton class="hub-skeleton__hero" />
      <USkeleton class="hub-skeleton__cta" />
    </div>

    <section v-else-if="playerLoadFailed" class="hub-state" aria-labelledby="me-error-title">
      <h1 id="me-error-title" class="page-title">无法读取玩家信息</h1>
      <UButton label="重试" color="primary" :loading="retrying" @click="retryAll" />
    </section>

    <section v-else-if="sessionUnavailable" class="hub-state" aria-labelledby="me-session-title">
      <h1 id="me-session-title" class="page-title">需要登录</h1>
      <UButton to="/login" label="去登录" color="primary" />
    </section>
  </main>
</template>

<style scoped>
.hub { display: grid; align-content: start; gap: var(--space-6); max-width: 44rem; padding-block: clamp(3rem, 10vh, 6rem) 4.5rem; }
.hub-hero { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-6); }
.hub-hero__id { display: grid; gap: var(--space-2); min-width: 0; }
.hub-hero__name { margin: 0; overflow-wrap: anywhere; font-family: var(--font-display); font-size: clamp(2.5rem, 7vw, 4.5rem); font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.hub-hero__title { --mark-size: 1.5rem; display: inline-flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 600; }
.hub-hero__xp { display: grid; justify-items: end; color: inherit; text-decoration: none; }
.hub-hero__xp strong { color: var(--text); font-family: var(--font-display); font-size: clamp(2.5rem, 6vw, 3.75rem); font-weight: 700; line-height: 1; }
.hub-hero__xp > span { color: var(--quiet); font-family: var(--font-display); font-size: var(--type-caption-size); letter-spacing: .14em; }
.hub-hero__xp small { margin-top: var(--space-2); color: var(--quiet); font-size: var(--type-caption-size); }
.hub-hero__xp:hover strong { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: .2em; }
.hub-cta { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4); min-height: 4.5rem; padding: 0 var(--space-6); border-radius: var(--radius-card); background: var(--accent); color: var(--on-accent); font-size: 1.25rem; font-weight: 700; text-decoration: none; transition: transform 160ms ease, box-shadow 160ms ease; }
.hub-cta:hover, .hub-cta:focus-visible { box-shadow: 0 .75rem 2rem -1rem var(--accent); transform: translateY(-1px); }
.hub-cta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-cta svg { width: 1.375rem; height: 1.375rem; }
.hub-cta--warn { background: var(--signal); color: oklch(20% .03 75); }
.hub-cta--warn:hover, .hub-cta--warn:focus-visible { box-shadow: 0 .75rem 2rem -1rem var(--signal); }
.hub-recent { display: grid; gap: var(--space-2); }
.hub-recent__title { margin: 0; color: var(--quiet); font-family: var(--font-display); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .14em; }
.hub-recent__all { display: inline-flex; align-items: center; gap: var(--space-1); justify-self: start; min-height: 2.75rem; padding-inline: var(--space-2); color: var(--accent); font-size: var(--type-body-sm-size); font-weight: 600; text-decoration: none; }
.hub-recent__all:hover { color: var(--text); }
.hub-nudge { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin: 0; }
.hub-nudge a { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--type-label-sm-size); text-decoration: none; }
.hub-nudge a:hover { color: var(--text); }
.hub-state { display: grid; gap: var(--space-4); justify-items: start; }
.hub-skeleton { display: grid; gap: var(--space-6); }
.hub-skeleton__hero { height: 6rem; }
.hub-skeleton__cta { height: 4.5rem; border-radius: var(--radius-card); }
@media (prefers-reduced-motion: reduce) { .hub-cta { transition: none; } }
@media (max-width: 47.99rem) {
  .hub { padding-block: var(--space-8) var(--space-12); }
  .hub-cta { min-height: 4rem; padding: 0 var(--space-5); font-size: 1.125rem; }
}
</style>
