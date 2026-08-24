<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "玩家中心 · 躲避堡垒 3" });

const { player, status, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles } = usePlayerTitles();
const api = usePortalApi();
const { profiles: masteryProfiles, overviewLoading: masteryLoading, overviewError: masteryError, refreshOverview: refreshMastery } = usePlayerMastery();

const loading = shallowRef(true);
const playerError = shallowRef("");
const titlesError = shallowRef("");
const titlesReady = shallowRef(false);
const retrying = shallowRef(false);
const masteryRetrying = shallowRef(false);
const masteryMapNames = shallowRef<Record<string, string>>({});
const recentTitles = computed(() => [...titles.value].sort((left, right) => right.grantedAt - left.grantedAt).slice(0, 3));
const formatTitleDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
const titleMeta = (title: (typeof titles.value)[number]) => title.mapName ?? (title.scope === "global" ? title.category : "");

const showSkeleton = computed(() => loading.value && !player.value);
const sessionUnavailable = computed(() => !loading.value && !player.value && !playerError.value && status.value === "anonymous");
const playerLoadFailed = computed(() => !loading.value && !player.value && Boolean(playerError.value));

async function loadMastery() {
  const [mastery, maps] = await Promise.all([
    refreshMastery(),
    api<{ items: Array<{ mapId: string; mapName: string }> }>("/v1/maps").catch(() => null),
  ]);
  if (maps) masteryMapNames.value = Object.fromEntries(maps.items.map((map) => [map.mapId, map.mapName]));
  return mastery;
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

    if (playerResult.status === "fulfilled" && playerResult.value) void loadMastery();
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
  masteryRetrying.value = true;
  try {
    await loadMastery();
  } finally {
    masteryRetrying.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="me-page page-shell">
    <template v-if="player">
      <section class="intro" aria-labelledby="dashboard-title">
        <div class="intro-copy">
          <h1 id="dashboard-title" class="page-title">你好，{{ player.player.playerName }}</h1>
        </div>
        <div class="intro-actions">
          <UButton to="/submissions/new" icon="i-lucide-upload" label="提交截图" color="primary" size="lg" class="intro-action" />
        </div>
      </section>

      <UAlert
        v-if="playerError"
        color="warning"
        variant="subtle"
        title="玩家信息可能不是最新"
        :description="playerError"
        class="me-alert"
      >
        <template #actions>
          <UButton label="重试" color="neutral" variant="outline" size="sm" :loading="retrying" @click="retryAll" />
        </template>
      </UAlert>

      <PlayerIdentityCard :player-name="player.player.playerName" :player-id="player.player.playerId" />

      <section class="section-block" aria-labelledby="submissions-title">
        <PageSectionHeader title="最近提交" heading-id="submissions-title" />
        <PlayerRecentSubmissions :submissions="player.recentSubmissions" />
      </section>

      <section class="section-block mastery-section" aria-labelledby="mastery-title">
        <PageSectionHeader title="地图精通" heading-id="mastery-title">
          <template #actions><UButton to="/maps" label="查看地图" color="neutral" variant="outline" /></template>
        </PageSectionHeader>
        <UAlert v-if="masteryError" color="error" variant="subtle" title="无法读取精通记录" :description="masteryError" class="me-alert">
          <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" :loading="masteryRetrying" @click="retryMastery" /></template>
        </UAlert>
        <div v-else-if="masteryLoading" class="mastery-loading" role="status" aria-label="读取精通记录…"><USkeleton /><USkeleton /></div>
        <MasteryMapOverview v-else :profiles="masteryProfiles" :map-names="masteryMapNames" />
      </section>

      <section class="section-block titles-section" aria-labelledby="titles-title">
        <PageSectionHeader title="最近获得的称号" heading-id="titles-title">
          <template #actions>
            <UButton to="/achievements" label="查看全部成就" color="neutral" variant="outline" />
          </template>
        </PageSectionHeader>
        <UAlert
          v-if="titlesError"
          color="error"
          variant="subtle"
          title="无法读取称号"
          :description="titlesError"
          class="me-alert"
        >
          <template #actions>
            <UButton label="重试" color="neutral" variant="outline" size="sm" :loading="retrying" @click="retryTitles" />
          </template>
        </UAlert>
        <ul v-else-if="titlesReady && recentTitles.length" class="recent-titles" data-testid="titles">
          <li v-for="title in recentTitles" :key="title.grantId" class="recent-title">
            <strong>{{ title.label }}</strong>
            <span>{{ formatTitleDate(title.grantedAt) }}<template v-if="titleMeta(title)"> · {{ titleMeta(title) }}</template></span>
          </li>
        </ul>
        <UEmpty v-else-if="titlesReady" title="暂无称号" variant="naked" />
        <div v-else-if="loading" class="titles-loading" role="status" aria-label="读取中…">
          <USkeleton class="titles-loading-card" />
          <USkeleton class="titles-loading-card" />
          <USkeleton class="titles-loading-card" />
        </div>
      </section>

    </template>

    <div v-else-if="showSkeleton" class="me-skeleton" role="status" aria-label="读取中…">
      <section class="me-skeleton-intro" aria-hidden="true">
        <div class="me-skeleton-intro-copy">
          <USkeleton class="me-skeleton-heading" />
        </div>
        <USkeleton class="me-skeleton-intro-action" />
      </section>

      <div class="me-skeleton-identity surface-card" aria-hidden="true">
        <USkeleton class="me-skeleton-avatar" />
        <div class="me-skeleton-identity-copy">
          <USkeleton class="me-skeleton-identity-label" />
          <USkeleton class="me-skeleton-identity-name" />
        </div>
      </div>

      <section class="me-skeleton-section" aria-hidden="true">
        <div class="me-skeleton-section-heading me-skeleton-section-heading-plain">
          <USkeleton class="me-skeleton-section-title" />
        </div>
        <div class="me-skeleton-submission-list">
          <article v-for="row in 3" :key="`submission-${row}`" class="me-skeleton-submission-row">
            <div class="me-skeleton-submission-copy">
              <USkeleton class="me-skeleton-submission-name" />
              <USkeleton class="me-skeleton-submission-date" />
            </div>
            <USkeleton class="me-skeleton-submission-status" />
          </article>
        </div>
      </section>

      <section class="me-skeleton-section" aria-hidden="true">
        <div class="me-skeleton-section-heading">
          <USkeleton class="me-skeleton-section-title" />
          <USkeleton class="me-skeleton-action" />
        </div>
        <div class="me-skeleton-mastery-grid">
          <USkeleton v-for="card in 2" :key="`mastery-${card}`" class="me-skeleton-mastery-card" />
        </div>
      </section>

      <section class="me-skeleton-section titles-section" aria-hidden="true">
        <div class="me-skeleton-section-heading">
          <USkeleton class="me-skeleton-section-title" />
          <USkeleton class="me-skeleton-action" />
        </div>
        <div class="me-skeleton-title-list">
          <article v-for="card in 3" :key="`title-${card}`" class="me-skeleton-title-row">
            <USkeleton class="me-skeleton-title-name" />
            <USkeleton class="me-skeleton-title-copy" />
          </article>
        </div>
      </section>

    </div>

    <section v-else-if="playerLoadFailed" class="me-state surface-card" aria-labelledby="me-error-title">
      <h1 id="me-error-title" class="page-title">无法读取玩家信息</h1>
      <p class="body-copy">{{ playerError }}</p>
      <UButton label="重试" color="primary" :loading="retrying" @click="retryAll" />
    </section>

    <section v-else-if="sessionUnavailable" class="me-state surface-card" aria-labelledby="me-session-title">
      <h1 id="me-session-title" class="page-title">需要登录</h1>
      <p class="body-copy">当前会话不可用。</p>
      <UButton to="/login" label="去登录" color="primary" />
    </section>
  </main>
</template>

<style scoped>
.me-page { padding-block: clamp(4rem, 9vh, 6.5rem) 4.5rem; }
.intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; margin-bottom: 32px; }
.intro-copy { min-width: 0; }
.intro-copy .page-title { overflow-wrap: anywhere; }
.intro-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 0.75rem; }
.intro-action { flex: 0 0 auto; }
.me-alert { margin-bottom: 20px; }
.section-block { margin-top: clamp(3.5rem, 8vw, 5.5rem); }
.titles-section { margin-top: clamp(3.25rem, 8vw, 5.375rem); }
.recent-titles { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.recent-title { display: grid; gap: 5px; min-width: 0; padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.recent-title strong { overflow-wrap: anywhere; font-weight: 650; letter-spacing: var(--type-headline-tracking); }
.recent-title span { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; }
.titles-loading { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.titles-loading-card { min-height: 112px; border-radius: 16px; }
.mastery-loading { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.mastery-loading > * { min-height: 132px; border-radius: 16px; }
.me-state { display: grid; gap: 16px; justify-items: start; max-width: 640px; padding: clamp(24px, 5vw, 40px); }
.me-state .body-copy { margin: 0; }
.me-skeleton { display: grid; }
.me-skeleton-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; margin-bottom: 32px; }
.me-skeleton-intro-copy { display: grid; gap: 14px; min-width: 0; }
.me-skeleton-intro-action { flex: 0 0 auto; width: 132px; height: 44px; border-radius: 999px; }
.me-skeleton-heading { width: min(58%, 360px); height: 46px; }
.me-skeleton-identity { display: flex; align-items: center; gap: 15px; padding: 22px; }
.me-skeleton-avatar { flex: 0 0 auto; width: 48px; height: 48px; border-radius: 50%; }
.me-skeleton-identity-copy { display: grid; flex: 1; gap: 8px; min-width: 0; }
.me-skeleton-identity-label { width: 54px; height: 12px; }
.me-skeleton-identity-name { width: min(44%, 220px); height: 25px; }
.me-skeleton-section { display: grid; gap: 16px; margin-top: clamp(56px, 8vw, 88px); }
.me-skeleton-section.titles-section { margin-top: clamp(52px, 8vw, 86px); }
.me-skeleton-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.me-skeleton-section-heading-plain { align-items: flex-start; flex-direction: column; gap: 10px; }
.me-skeleton-section-title { width: 150px; height: 22px; }
.me-skeleton-action { width: 118px; height: 40px; border-radius: 999px; }
.me-skeleton-mastery-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.me-skeleton-mastery-card { min-height: 132px; border-radius: 16px; }
.me-skeleton-title-list { display: grid; gap: 10px; }
.me-skeleton-title-row {
  display: grid;
  gap: 5px;
  min-height: 0;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}
.me-skeleton-title-name { width: 42%; height: 18px; }
.me-skeleton-title-copy { width: 28%; height: 12px; }
.me-skeleton-submission-list { display: grid; gap: 10px; }
.me-skeleton-submission-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  min-height: 78px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}
.me-skeleton-submission-copy { display: grid; flex: 1; gap: 8px; min-width: 0; }
.me-skeleton-submission-name { width: min(42%, 220px); height: 18px; }
.me-skeleton-submission-date { width: 30%; height: 12px; }
.me-skeleton-submission-status { width: 68px; height: 24px; border-radius: 999px; }
@media (max-width: 760px) {
  .titles-loading, .mastery-loading, .me-skeleton-mastery-grid { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .intro { align-items: stretch; flex-direction: column; gap: 22px; }
  .intro-actions { width: 100%; flex-direction: column; align-items: stretch; }
  .intro-action { width: 100%; justify-content: center; }
  .me-skeleton-intro { align-items: stretch; flex-direction: column; gap: 22px; margin-bottom: 20px; }
  .me-skeleton-intro-action { width: 100%; }
  .me-skeleton-heading { width: 76%; height: 38px; }
  .me-skeleton-identity { padding: 18px; }
  .me-skeleton-section-heading { align-items: flex-start; }
  .me-skeleton-section-title { width: 128px; }
  .me-skeleton-action { width: 102px; height: 38px; }
  .me-skeleton-submission-row { align-items: flex-start; flex-direction: column; gap: 12px; padding: 16px; }
  .me-skeleton-submission-status { align-self: flex-start; }
}
@media (max-width: 360px) {
  .me-page { padding-block: 48px 48px; }
  .me-state :deep(button) { width: 100%; justify-content: center; }
}
</style>
