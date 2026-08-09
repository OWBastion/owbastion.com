<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "玩家中心 · 躲避堡垒 3" });

const { player, status, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles } = usePlayerTitles();

const loading = shallowRef(true);
const playerError = shallowRef("");
const titlesError = shallowRef("");
const titlesReady = shallowRef(false);
const retrying = shallowRef(false);

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

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="me-page page-shell">
    <template v-if="player">
      <section class="intro" aria-labelledby="dashboard-title">
        <div class="intro-copy">
          <p class="eyebrow">玩家中心</p>
          <h1 id="dashboard-title" class="page-title">你好，{{ player.player.playerName }}</h1>
        </div>
        <div class="intro-actions">
          <UButton to="/blog" label="开发日志" color="neutral" variant="outline" size="lg" class="intro-action" />
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
        <TitleCollection v-else-if="titlesReady && titles.length" :titles="titles.slice(0, 3)" />
        <UEmpty v-else-if="titlesReady" title="暂无称号" variant="naked" />
        <div v-else-if="loading" class="titles-loading" role="status" aria-label="读取中…">
          <USkeleton class="titles-loading-card" />
          <USkeleton class="titles-loading-card" />
          <USkeleton class="titles-loading-card" />
        </div>
      </section>

      <section class="upcoming-section" aria-labelledby="upcoming-title" aria-describedby="upcoming-status">
        <PageSectionHeader title="更多功能" heading-id="upcoming-title" />
        <p id="upcoming-status" class="upcoming-status">未开放</p>
        <div class="upcoming-grid">
          <article class="upcoming-card surface-card" aria-disabled="true">
            <span class="upcoming-index" aria-hidden="true">01</span>
            <div>
              <p class="upcoming-kicker type-kicker">限时目标</p>
              <h3 class="type-headline">轮换挑战</h3>
            </div>
          </article>
          <article class="upcoming-card surface-card" aria-disabled="true">
            <span class="upcoming-index" aria-hidden="true">02</span>
            <div>
              <p class="upcoming-kicker type-kicker">地图记录</p>
              <h3 class="type-headline">地图挑战进度</h3>
            </div>
          </article>
        </div>
      </section>
    </template>

    <div v-else-if="showSkeleton" class="me-skeleton" role="status" aria-label="读取中…">
      <section class="me-skeleton-intro" aria-hidden="true">
        <div class="me-skeleton-intro-copy">
          <USkeleton class="me-skeleton-eyebrow" />
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

      <section class="me-skeleton-section titles-section" aria-hidden="true">
        <div class="me-skeleton-section-heading">
          <USkeleton class="me-skeleton-section-title" />
          <USkeleton class="me-skeleton-action" />
        </div>
        <div class="me-skeleton-title-grid">
          <article v-for="card in 3" :key="`title-${card}`" class="me-skeleton-title-card">
            <USkeleton class="me-skeleton-title-kicker" />
            <USkeleton class="me-skeleton-title-name" />
            <USkeleton class="me-skeleton-title-copy" />
          </article>
        </div>
      </section>

      <section class="me-skeleton-section" aria-hidden="true">
        <div class="me-skeleton-section-heading me-skeleton-section-heading-plain">
          <USkeleton class="me-skeleton-section-title" />
        </div>
        <div class="me-skeleton-upcoming-grid">
          <article v-for="card in 2" :key="`upcoming-${card}`" class="me-skeleton-upcoming-card surface-card">
            <USkeleton class="me-skeleton-upcoming-index" />
            <div class="me-skeleton-upcoming-copy">
              <USkeleton class="me-skeleton-upcoming-kicker" />
              <USkeleton class="me-skeleton-upcoming-title" />
            </div>
          </article>
        </div>
      </section>
    </div>

    <section v-else-if="playerLoadFailed" class="me-state surface-card" aria-labelledby="me-error-title">
      <p class="eyebrow">玩家中心</p>
      <h1 id="me-error-title" class="page-title">无法读取玩家信息</h1>
      <p class="body-copy">{{ playerError }}</p>
      <UButton label="重试" color="primary" :loading="retrying" @click="retryAll" />
    </section>

    <section v-else-if="sessionUnavailable" class="me-state surface-card" aria-labelledby="me-session-title">
      <p class="eyebrow">玩家中心</p>
      <h1 id="me-session-title" class="page-title">需要登录</h1>
      <p class="body-copy">当前会话不可用。</p>
      <UButton to="/login" label="去登录" color="primary" />
    </section>
  </main>
</template>

<style scoped>
.me-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; margin-bottom: 32px; }
.intro-copy { min-width: 0; max-width: 690px; }
.intro-copy .page-title { overflow-wrap: anywhere; }
.intro-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; }
.intro-action { flex: 0 0 auto; }
.me-alert { margin-bottom: 20px; }
.section-block, .upcoming-section { margin-top: clamp(56px, 8vw, 88px); }
.titles-section { margin-top: clamp(52px, 8vw, 86px); }
.titles-loading { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.titles-loading-card { min-height: 112px; border-radius: 16px; }
.upcoming-status { margin: -4px 0 14px; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; }
.upcoming-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.upcoming-card {
  position: relative;
  display: flex;
  min-height: 12.5rem;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 20px;
  color: var(--muted);
  background: var(--surface-raised);
  pointer-events: none;
  user-select: none;
}
.upcoming-index { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 720; letter-spacing: .08em; }
.upcoming-kicker { margin: 0 0 8px; color: var(--quiet); }
.upcoming-card .type-headline {
  margin: 0;
  color: color-mix(in oklch, var(--text) 72%, var(--muted));
  font-size: clamp(1.1rem, 2vw, 1.35rem);
}
.me-state { display: grid; gap: 16px; justify-items: start; max-width: 640px; padding: clamp(24px, 5vw, 40px); }
.me-state .body-copy { margin: 0; }
.me-skeleton { display: grid; }
.me-skeleton-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; margin-bottom: 32px; }
.me-skeleton-intro-copy { display: grid; gap: 14px; min-width: 0; max-width: 690px; }
.me-skeleton-intro-action { flex: 0 0 auto; width: 132px; height: 44px; border-radius: 999px; }
.me-skeleton-eyebrow { width: 72px; height: 12px; }
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
.me-skeleton-title-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.me-skeleton-title-card {
  display: grid;
  min-height: 132px;
  align-content: start;
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-raised);
}
.me-skeleton-title-kicker { width: 64px; height: 11px; }
.me-skeleton-title-name { width: 72%; height: 21px; }
.me-skeleton-title-copy { width: 92%; height: 13px; }
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
.me-skeleton-upcoming-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.me-skeleton-upcoming-card {
  display: flex;
  min-height: 12.5rem;
  flex-direction: column;
  justify-content: space-between;
  padding: 20px;
}
.me-skeleton-upcoming-index { width: 20px; height: 12px; }
.me-skeleton-upcoming-copy { display: grid; gap: 10px; }
.me-skeleton-upcoming-kicker { width: 72px; height: 12px; }
.me-skeleton-upcoming-title { width: 124px; height: 24px; }
@media (max-width: 760px) {
  .upcoming-grid, .titles-loading, .me-skeleton-title-grid, .me-skeleton-upcoming-grid { grid-template-columns: 1fr; }
  .upcoming-card, .me-skeleton-upcoming-card { min-height: 10.5rem; }
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
