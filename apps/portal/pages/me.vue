<script setup lang="ts">
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "玩家中心 · 躲避堡垒 3" });

const { player, refresh } = useCurrentPlayer();
const { items: titles, refresh: refreshTitles } = usePlayerTitles();
const loading = ref(true);

onMounted(async () => {
  await Promise.all([refresh(), refreshTitles()]);
  loading.value = false;
});
</script>

<template>
  <main class="me-page page-shell">
    <template v-if="player">
      <section class="intro" aria-labelledby="dashboard-title">
        <p class="eyebrow">玩家中心</p>
        <h1 id="dashboard-title" class="page-title">你好，{{ player.player.playerName }}</h1>
      </section>

      <PlayerIdentityCard :player-name="player.player.playerName" :player-id="player.player.playerId" aria-label="玩家身份" />

      <section class="section-block titles-section" aria-labelledby="titles-title">
        <PageSectionHeader title="最近获得的称号"><template #actions><UButton to="/achievements" label="查看全部成就" color="neutral" variant="outline" /></template></PageSectionHeader>
        <TitleCollection v-if="titles.length" :titles="titles.slice(0, 3)" />
        <UEmpty v-else title="暂无称号" variant="naked" />
      </section>

      <section class="section-block" aria-labelledby="submissions-title">
        <PageSectionHeader title="最近提交"><template #actions><UButton to="/submissions/new" icon="i-lucide-upload" label="提交截图" color="neutral" variant="outline" /></template></PageSectionHeader>
        <PlayerRecentSubmissions :submissions="player.recentSubmissions" />
      </section>

      <section class="upcoming-section" aria-labelledby="upcoming-title">
        <PageSectionHeader eyebrow="未开放" title="更多功能" />
        <div class="upcoming-grid">
          <article class="upcoming-card surface-card">
            <div class="upcoming-card-top"><span class="upcoming-index">01</span><span class="coming-soon-label glass-chip">未开放</span></div>
            <div><p class="upcoming-kicker">限时目标</p><h3>轮换挑战</h3></div>
          </article>
          <article class="upcoming-card surface-card">
            <div class="upcoming-card-top"><span class="upcoming-index">02</span><span class="coming-soon-label glass-chip">未开放</span></div>
            <div><p class="upcoming-kicker">地图记录</p><h3>地图挑战进度</h3></div>
          </article>
        </div>
      </section>
    </template>
    <div v-else-if="loading" class="me-skeleton" role="status" aria-label="读取中…">
      <section class="me-skeleton-intro" aria-hidden="true"><USkeleton class="me-skeleton-eyebrow" /><USkeleton class="me-skeleton-heading" /></section>

      <div class="me-skeleton-identity surface-card" aria-hidden="true">
        <USkeleton class="me-skeleton-avatar" />
        <div class="me-skeleton-identity-copy"><USkeleton class="me-skeleton-identity-label" /><USkeleton class="me-skeleton-identity-name" /></div>
        <div class="me-skeleton-identity-status"><USkeleton class="me-skeleton-identity-status-label" /><USkeleton class="me-skeleton-identity-status-value" /></div>
      </div>

      <section class="me-skeleton-section titles-section" aria-hidden="true">
        <div class="me-skeleton-section-heading"><USkeleton class="me-skeleton-section-title" /><USkeleton class="me-skeleton-action" /></div>
        <div class="me-skeleton-title-grid"><article v-for="card in 3" :key="`title-${card}`" class="me-skeleton-title-card"><USkeleton class="me-skeleton-title-kicker" /><USkeleton class="me-skeleton-title-name" /><USkeleton class="me-skeleton-title-copy" /></article></div>
      </section>

      <section class="me-skeleton-section" aria-hidden="true">
        <div class="me-skeleton-section-heading"><USkeleton class="me-skeleton-section-title" /><USkeleton class="me-skeleton-action" /></div>
        <div class="me-skeleton-submission-list"><article v-for="row in 3" :key="`submission-${row}`" class="me-skeleton-submission-row"><div class="me-skeleton-submission-copy"><USkeleton class="me-skeleton-submission-name" /><USkeleton class="me-skeleton-submission-date" /></div><USkeleton class="me-skeleton-submission-status" /></article></div>
      </section>

      <section class="me-skeleton-section" aria-hidden="true">
        <div class="me-skeleton-section-heading me-skeleton-section-heading-plain"><USkeleton class="me-skeleton-section-eyebrow" /><USkeleton class="me-skeleton-section-title" /></div>
        <div class="me-skeleton-upcoming-grid"><article v-for="card in 2" :key="`upcoming-${card}`" class="me-skeleton-upcoming-card surface-card"><div class="me-skeleton-upcoming-top"><USkeleton class="me-skeleton-upcoming-index" /><USkeleton class="me-skeleton-upcoming-badge" /></div><div class="me-skeleton-upcoming-copy"><USkeleton class="me-skeleton-upcoming-kicker" /><USkeleton class="me-skeleton-upcoming-title" /></div></article></div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.me-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.intro { max-width: 690px; margin-bottom: 32px; }
.section-block, .upcoming-section { margin-top: clamp(66px, 10vw, 110px); }
.titles-section { margin-top: clamp(52px, 8vw, 86px); }
.upcoming-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.upcoming-card { position: relative; display: flex; min-height: 17rem; flex-direction: column; justify-content: space-between; overflow: hidden; padding: 22px; background: color-mix(in oklch, var(--surface-raised) 72%, var(--surface)); }
.upcoming-card::after { position: absolute; inset: auto -16% -36% auto; width: 165px; height: 165px; border-radius: 50%; background: oklch(54% .045 55 / 16%); filter: blur(18px); content: ""; }
.upcoming-card-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--quiet); font-size: .68rem; font-weight: 720; letter-spacing: .08em; }
.upcoming-index { color: color-mix(in oklch, var(--quiet) 75%, transparent); }
.coming-soon-label { padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); }
.upcoming-card > div:last-child { position: relative; z-index: 1; max-width: 25ch; }
.upcoming-kicker { margin: 0 0 9px; color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .05em; }
.upcoming-card h3 { margin: 0; color: color-mix(in oklch, var(--text) 84%, var(--muted)); font-size: clamp(1.22rem, 2.3vw, 1.55rem); letter-spacing: -.035em; }
.upcoming-card p:last-child { margin: 12px 0 0; color: var(--quiet); font-size: .82rem; line-height: 1.6; }
.me-skeleton { display: grid; }.me-skeleton-intro { display: grid; gap: 14px; max-width: 690px; margin-bottom: 32px; }.me-skeleton-eyebrow { width: 72px; height: 12px; }.me-skeleton-heading { width: min(58%, 360px); height: 46px; }.me-skeleton-identity { display: flex; align-items: center; gap: 15px; padding: 22px; }.me-skeleton-avatar { flex: 0 0 auto; width: 48px; height: 48px; border-radius: 50%; }.me-skeleton-identity-copy { display: grid; flex: 1; gap: 8px; min-width: 0; }.me-skeleton-identity-label { width: 54px; height: 12px; }.me-skeleton-identity-name { width: min(44%, 220px); height: 25px; }.me-skeleton-identity-status { display: grid; flex: 0 0 auto; gap: 8px; justify-items: end; }.me-skeleton-identity-status-label { width: 48px; height: 12px; }.me-skeleton-identity-status-value { width: 58px; height: 22px; border-radius: 999px; }.me-skeleton-section { display: grid; gap: 16px; margin-top: clamp(66px, 10vw, 110px); }.me-skeleton-section.titles-section { margin-top: clamp(52px, 8vw, 86px); }.me-skeleton-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.me-skeleton-section-heading-plain { align-items: flex-start; flex-direction: column; gap: 10px; }.me-skeleton-section-eyebrow { width: 48px; height: 11px; }.me-skeleton-section-title { width: 150px; height: 22px; }.me-skeleton-action { width: 118px; height: 40px; border-radius: 999px; }.me-skeleton-title-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }.me-skeleton-title-card { display: grid; min-height: 132px; align-content: start; gap: 10px; padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: color-mix(in oklch, var(--surface-raised) 76%, var(--surface)); }.me-skeleton-title-kicker { width: 64px; height: 11px; }.me-skeleton-title-name { width: 72%; height: 21px; }.me-skeleton-title-copy { width: 92%; height: 13px; }.me-skeleton-submission-list { display: grid; gap: 10px; }.me-skeleton-submission-row { display: flex; align-items: center; justify-content: space-between; gap: 22px; min-height: 78px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }.me-skeleton-submission-copy { display: grid; flex: 1; gap: 8px; min-width: 0; }.me-skeleton-submission-name { width: min(42%, 220px); height: 18px; }.me-skeleton-submission-date { width: 30%; height: 12px; }.me-skeleton-submission-status { width: 68px; height: 24px; border-radius: 999px; }.me-skeleton-upcoming-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.me-skeleton-upcoming-card { display: flex; min-height: 17rem; flex-direction: column; justify-content: space-between; padding: 22px; }.me-skeleton-upcoming-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.me-skeleton-upcoming-index { width: 20px; height: 12px; }.me-skeleton-upcoming-badge { width: 54px; height: 23px; border-radius: 999px; }.me-skeleton-upcoming-copy { display: grid; gap: 10px; }.me-skeleton-upcoming-kicker { width: 72px; height: 12px; }.me-skeleton-upcoming-title { width: 124px; height: 24px; }
@media (max-width: 760px) { .upcoming-grid { grid-template-columns: 1fr; }.upcoming-card { min-height: 13.75rem; } }
@media (max-width: 760px) { .me-skeleton-title-grid { grid-template-columns: 1fr; }.me-skeleton-upcoming-grid { grid-template-columns: 1fr; }.me-skeleton-upcoming-card { min-height: 13.75rem; } }
@media (max-width: 620px) { .me-skeleton-intro { margin-bottom: 20px; }.me-skeleton-heading { width: 76%; height: 38px; }.me-skeleton-identity { align-items: flex-start; flex-wrap: wrap; padding: 18px; }.me-skeleton-identity-copy { flex-basis: calc(100% - 63px); }.me-skeleton-identity-status { flex-basis: 100%; justify-items: start; padding-top: 17px; border-top: 1px solid var(--line); }.me-skeleton-section-heading { align-items: flex-start; }.me-skeleton-section-title { width: 128px; }.me-skeleton-action { width: 102px; height: 38px; }.me-skeleton-submission-row { align-items: flex-start; flex-direction: column; gap: 12px; padding: 16px; }.me-skeleton-submission-status { align-self: flex-start; } }
</style>
