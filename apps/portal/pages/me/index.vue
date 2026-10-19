<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { playerSubmissionStatusLabel } from "~/utils/submissionStatus";
import type { OwnedTitle } from "~/types/title";
import type { PortalMap } from "~/composables/usePortalApi";

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
const titlesError = shallowRef("");
const titlesReady = shallowRef(false);
const retrying = shallowRef(false);
const recentTitles = computed(() => [...titles.value].sort((left, right) => right.grantedAt - left.grantedAt).slice(0, 6));
const equippedTitles = computed(() => titles.value.filter((title) => title.equipped));
const inspected = shallowRef<OwnedTitle | null>(null);
const inspectOpen = shallowRef(false);
function inspectTitle(title: OwnedTitle) { inspected.value = title; inspectOpen.value = true; }

const currentProfiles = computed(() => masteryProfiles.value.filter((profile) => profile.gameplayRevisionLifecycle === "default"));
const masteryReady = computed(() => !masteryLoading.value && !masteryError.value);
const totalXp = computed(() => currentProfiles.value.reduce((sum, profile) => sum + profile.totalXp, 0));
const totalRuns = computed(() => currentProfiles.value.reduce((sum, profile) => sum + profile.verifiedRunCount, 0));
const { data: mapCatalog } = useLazyAsyncData("me-map-names", () => usePublicCatalog<{ items: PortalMap[] }>("maps"), { server: false });
const mapNames = computed(() => new Map((mapCatalog.value?.items ?? []).map((map) => [map.mapId, map.mapName])));
// Maps ranked by XP; the bar is relative to the strongest map so the ranking reads at a glance.
const masteryRanking = computed(() => {
  const ranked = [...currentProfiles.value].sort((left, right) => right.totalXp - left.totalXp).slice(0, 6);
  const top = ranked[0]?.totalXp || 1;
  return ranked.map((profile) => ({ profile, name: mapNames.value.get(profile.mapId) ?? profile.mapId, share: profile.totalXp / top }));
});
// Only a rejection that asks for a new upload needs the player; a final rejection stays in the list.
const needsAttention = computed(() => (player.value?.recentSubmissions ?? []).filter((submission) => submission.status === "rejected" && submission.resubmissionRequired));
const showSkeleton = computed(() => loading.value && !player.value);
const sessionUnavailable = computed(() => !loading.value && !player.value && !playerError.value && status.value === "anonymous");
const playerLoadFailed = computed(() => !loading.value && !player.value && Boolean(playerError.value));

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

async function retryTitles() {
  titlesError.value = "";
  retrying.value = true;
  try {
    await refreshTitles();
    titlesReady.value = true;
  } catch (error) {
    titlesReady.value = false;
    titlesError.value = portalErrorDetails(error, "无法读取称号，请稍后重试。").description;
  } finally {
    retrying.value = false;
  }
}

async function retryMastery() {
  await refreshMastery();
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
          <p class="eyebrow">Player hub</p>
          <h1 id="dashboard-title" class="hub-hero__name">{{ player.player.playerName }}</h1>
          <ul v-if="equippedTitles.length" class="hub-hero__equipped" aria-label="佩戴中的称号">
            <li v-for="title in equippedTitles" :key="title.grantId"><PlayerTitleMark :title="title" />{{ title.label }}</li>
          </ul>
          <NuxtLink v-else-if="titlesReady && titles.length" to="/me/achievements" class="hub-hero__equip-cta">佩戴一个称号，让它出现在你的主页 →</NuxtLink>
        </div>
        <div class="hub-hero__actions">
          <UButton to="/me/submissions/new" icon="i-lucide-upload" label="提交截图" color="primary" size="lg" />
          <UButton to="/me/profile" icon="i-lucide-id-card" label="个人主页" color="neutral" variant="outline" size="lg" />
          <UButton to="/me/settings" icon="i-lucide-settings" color="neutral" variant="outline" size="lg" aria-label="个人设置" />
        </div>
        <div class="hub-hero__stats">
          <MastheadStat label="精通 XP" :value="masteryReady ? totalXp : null" />
          <MastheadStat label="已验证通关" :value="masteryReady ? totalRuns : null" />
          <MastheadStat label="已精通地图" :value="masteryReady ? currentProfiles.length : null" />
          <MastheadStat label="称号" :value="titlesReady ? titles.length : null" />
        </div>
      </header>

      <div v-if="showPasskeyNudge" class="hub-nudge" role="region" aria-label="添加 Passkey">
        <UIcon name="i-lucide-fingerprint" class="hub-nudge__icon" aria-hidden="true" />
        <p class="hub-nudge__copy"><strong>添加 Passkey，下次一键登录</strong><span>用设备的指纹、面容或屏幕锁登录，无需在 QQ 群里验证。</span></p>
        <div class="hub-nudge__actions">
          <UButton to="/me/settings" label="去添加" color="primary" size="sm" />
          <UButton label="不再提醒" color="neutral" variant="ghost" size="sm" @click="dismissPasskeyNudge" />
        </div>
      </div>

      <UAlert v-if="playerError" color="warning" variant="subtle" title="玩家信息可能不是最新" :description="playerError" class="hub-alert">
        <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="retrying" @click="retryAll" /></template>
      </UAlert>
      <UAlert
        v-if="needsAttention.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`${needsAttention.length} 次提交需要你处理`"
        :description="`${needsAttention[0]!.mapName}：${playerSubmissionStatusLabel(needsAttention[0]!.status, needsAttention[0]!.resubmissionRequired)}`"
        class="hub-alert"
      >
        <template #actions><UButton :to="`/me/submissions/${needsAttention[0]!.submissionId}`" label="去处理" color="neutral" variant="outline" size="sm" /></template>
      </UAlert>

      <div class="hub-grid-host">
        <div class="hub-grid">
          <section class="hub-panel hub-panel--submissions" aria-labelledby="submissions-title">
            <header class="hub-panel__head"><h2 id="submissions-title" class="hub-panel__title">最近提交</h2></header>
            <PlayerRecentSubmissions :submissions="player.recentSubmissions" />
          </section>

          <section class="hub-panel hub-panel--mastery" aria-labelledby="mastery-title">
            <header class="hub-panel__head">
              <h2 id="mastery-title" class="hub-panel__title">地图精通</h2>
              <NuxtLink to="/me/achievements" class="hub-panel__link">我的成就<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
            </header>
            <UAlert v-if="masteryError" color="error" variant="subtle" title="无法读取精通记录" :description="masteryError">
              <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="masteryLoading" @click="retryMastery" /></template>
            </UAlert>
            <div v-else-if="!masteryReady" class="hub-loading" role="status" aria-label="读取中…"><USkeleton v-for="row in 3" :key="row" class="hub-loading__row" /></div>
            <ol v-else-if="masteryRanking.length" class="mastery-rank">
              <li v-for="(entry, index) in masteryRanking" :key="entry.profile.mapId">
                <NuxtLink :to="`/me/achievements/maps/${encodeURIComponent(entry.profile.mapId)}`" class="mastery-rank__row pressable-soft">
                  <span class="mastery-rank__pos num">{{ String(index + 1).padStart(2, "0") }}</span>
                  <span class="mastery-rank__body">
                    <span class="mastery-rank__line"><strong>{{ entry.name }}</strong><span class="num">{{ entry.profile.totalXp }} XP</span></span>
                    <span class="mastery-rank__bar" aria-hidden="true"><span :style="{ inlineSize: `${Math.max(entry.share * 100, 4)}%` }" /></span>
                    <span class="mastery-rank__meta">{{ entry.profile.verifiedRunCount }} 次通关<template v-if="entry.profile.highestCompletedDifficulty"> · 最高 {{ entry.profile.highestCompletedDifficulty }}</template></span>
                  </span>
                </NuxtLink>
              </li>
            </ol>
            <p v-else class="hub-empty">还没有已验证的通关。提交一张完成截图，审核通过后这里会出现你的地图排名。</p>
          </section>

          <section class="hub-panel hub-panel--titles" aria-labelledby="titles-title">
            <header class="hub-panel__head">
              <h2 id="titles-title" class="hub-panel__title">最近获得的称号</h2>
              <NuxtLink to="/me/achievements" class="hub-panel__link">查看全部<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
            </header>
            <UAlert v-if="titlesError" color="error" variant="subtle" title="无法读取称号" :description="titlesError">
              <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="retrying" @click="retryTitles" /></template>
            </UAlert>
            <ul v-else-if="titlesReady && recentTitles.length" class="hub-titles">
              <li v-for="title in recentTitles" :key="title.grantId"><PlayerTitleBadge :title="title" @inspect="inspectTitle" /></li>
            </ul>
            <p v-else-if="titlesReady" class="hub-empty">暂无称号。</p>
            <div v-else class="hub-loading" role="status" aria-label="读取中…"><USkeleton v-for="row in 2" :key="row" class="hub-loading__row" /></div>
          </section>
        </div>
      </div>

      <PlayerTitleInspectDialog v-model:open="inspectOpen" :title="inspected" />
    </template>

    <div v-else-if="showSkeleton" class="hub-skeleton" role="status" aria-label="读取中…">
      <USkeleton class="hub-skeleton__hero" />
      <div class="hub-skeleton__grid"><USkeleton v-for="card in 3" :key="card" class="hub-skeleton__panel" /></div>
    </div>

    <section v-else-if="playerLoadFailed" class="hub-state" aria-labelledby="me-error-title">
      <h1 id="me-error-title" class="page-title">无法读取玩家信息</h1>
      <p class="body-copy">{{ playerError }}</p>
      <UButton label="重试" color="primary" :loading="retrying" @click="retryAll" />
    </section>

    <section v-else-if="sessionUnavailable" class="hub-state" aria-labelledby="me-session-title">
      <h1 id="me-session-title" class="page-title">需要登录</h1>
      <p class="body-copy">当前会话不可用。</p>
      <UButton to="/login" label="去登录" color="primary" />
    </section>
  </main>
</template>

<style scoped>
.hub { display: grid; gap: var(--space-5); padding-block: clamp(2rem, 6vh, 4rem) 4.5rem; }
.hub-hero { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id actions" "stats stats"; gap: var(--space-6) var(--space-8); padding: clamp(var(--space-6), 4vw, var(--space-12)); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sheet); background: radial-gradient(60% 120% at 100% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 70%), linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 2rem 2rem, linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 2rem 2rem, var(--surface); }
.hub-hero__id { grid-area: id; display: grid; gap: var(--space-3); min-width: 0; }
.hub-hero__id .eyebrow { margin: 0; }
.hub-hero__name { margin: 0; overflow-wrap: anywhere; font-family: var(--font-display); font-size: clamp(2.25rem, 6vw, 4rem); font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.hub-hero__equipped { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.hub-hero__equipped li { --mark-size: 1.5rem; display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3) var(--space-1) var(--space-1); border: 1px solid color-mix(in oklch, var(--accent) 40%, var(--line)); border-radius: var(--radius-control); background: color-mix(in oklch, var(--accent) 8%, var(--surface)); font-size: var(--type-label-sm-size); font-weight: 600; }
.hub-hero__equip-cta { color: var(--accent); font-size: var(--type-label-sm-size); text-decoration: none; }
.hub-hero__equip-cta:hover { text-decoration: underline; }
.hub-hero__actions { grid-area: actions; display: flex; align-items: flex-start; gap: var(--space-2); }
.hub-hero__stats { grid-area: stats; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); }
.hub-hero__stats :deep(.stat) { background: color-mix(in oklch, var(--page) 60%, var(--surface)); }
.hub-hero__stats :deep(.stat__value) { font-family: var(--font-display); font-size: clamp(1.5rem, 3vw, 2rem); }
.hub-nudge { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-5); border: 1px dashed color-mix(in oklch, var(--accent) 50%, var(--line)); border-radius: var(--radius-card); background: var(--accent-surface); }
.hub-nudge__icon { flex: none; width: 1.5rem; height: 1.5rem; color: var(--accent); }
.hub-nudge__copy { display: grid; flex: 1; gap: 2px; margin: 0; }
.hub-nudge__copy span { color: var(--muted); font-size: var(--type-body-sm-size); }
.hub-nudge__actions { display: flex; flex: none; gap: var(--space-2); }
.hub-grid-host { container-type: inline-size; }
.hub-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5); }
.hub-panel { display: grid; align-content: start; gap: var(--space-4); min-width: 0; padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.hub-panel__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
.hub-panel__title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; letter-spacing: .01em; }
.hub-panel__link { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; text-decoration: none; }
.hub-panel__link:hover { text-decoration: underline; }
.hub-empty { margin: 0; color: var(--muted); font-size: var(--type-body-sm-size); line-height: 1.6; }
.hub-loading { display: grid; gap: var(--space-2); }
.hub-loading__row { height: 3.25rem; border-radius: var(--radius-control); }
.mastery-rank { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.mastery-rank__row { display: grid; grid-template-columns: 2rem minmax(0, 1fr); align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--radius-control); color: inherit; text-decoration: none; }
.mastery-rank__row:hover, .mastery-rank__row:focus-visible { background: var(--surface-raised); }
.mastery-rank__pos { color: var(--quiet); font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
li:first-child .mastery-rank__pos { color: var(--accent); }
.mastery-rank__body { display: grid; gap: var(--space-1); min-width: 0; }
.mastery-rank__line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.mastery-rank__line strong { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.mastery-rank__line .num { flex: none; color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 700; }
.mastery-rank__bar { display: block; height: .3rem; overflow: hidden; border-radius: var(--radius-pill); background: var(--line); }
.mastery-rank__bar > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in oklch, var(--accent) 55%, transparent), var(--accent)); }
.mastery-rank__meta { color: var(--quiet); font-size: var(--type-caption-size); }
.hub-titles { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.hub-titles > li { min-width: 0; max-width: 100%; }
.hub-state { display: grid; gap: var(--space-4); justify-items: start; max-width: 40rem; padding: clamp(var(--space-6), 5vw, var(--space-8)); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.hub-state .body-copy { margin: 0; }
.hub-skeleton { display: grid; gap: var(--space-5); }
.hub-skeleton__hero { height: 16rem; border-radius: var(--radius-sheet); }
.hub-skeleton__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: var(--space-5); }
.hub-skeleton__panel { height: 14rem; border-radius: var(--radius-card); }
@container (min-width: 52rem) {
  .hub-grid { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); grid-template-areas: "submissions mastery" "titles titles"; }
  .hub-panel--submissions { grid-area: submissions; }
  .hub-panel--mastery { grid-area: mastery; }
  .hub-panel--titles { grid-area: titles; }
}
@media (max-width: 47.99rem) {
  .hub { padding-block: var(--space-6) var(--space-12); }
  .hub-hero { grid-template-columns: minmax(0, 1fr); grid-template-areas: "id" "stats" "actions"; padding: var(--space-5); }
  .hub-hero__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hub-hero__actions { display: grid; grid-template-columns: 1fr auto; }
  .hub-hero__actions > :first-child { grid-column: 1 / -1; justify-content: center; }
  .hub-hero__actions > :nth-child(2) { justify-content: center; }
  .hub-nudge { align-items: stretch; flex-direction: column; }
  .hub-nudge__actions { justify-content: flex-end; }
  .hub-panel { padding: var(--space-4); }
  .hub-state :deep(button) { width: 100%; justify-content: center; }
}
@media (prefers-contrast: more) { .hub-hero, .hub-panel { border-color: var(--text); } }
</style>
