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
            <div class="upcoming-card-top"><span class="upcoming-index">01</span><span class="coming-soon-label">未开放</span></div>
            <div><p class="upcoming-kicker">限时目标</p><h3>轮换挑战</h3></div>
          </article>
          <article class="upcoming-card surface-card">
            <div class="upcoming-card-top"><span class="upcoming-index">02</span><span class="coming-soon-label">未开放</span></div>
            <div><p class="upcoming-kicker">地图记录</p><h3>地图挑战进度</h3></div>
          </article>
        </div>
      </section>
    </template>
    <ThinkingOrbLoader v-else-if="loading" state="listening" />
  </main>
</template>

<style scoped>
.me-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.intro { max-width: 690px; margin-bottom: 32px; }
.section-block, .upcoming-section { margin-top: clamp(66px, 10vw, 110px); }
.titles-section { margin-top: clamp(52px, 8vw, 86px); }
.upcoming-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.upcoming-card { position: relative; display: flex; min-height: 272px; flex-direction: column; justify-content: space-between; overflow: hidden; padding: 22px; background: color-mix(in oklch, var(--surface-raised) 72%, var(--surface)); }
.upcoming-card::after { position: absolute; inset: auto -16% -36% auto; width: 165px; height: 165px; border-radius: 50%; background: oklch(54% .045 55 / 16%); filter: blur(18px); content: ""; }
.upcoming-card-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--quiet); font-size: .68rem; font-weight: 720; letter-spacing: .08em; }
.upcoming-index { color: color-mix(in oklch, var(--quiet) 75%, transparent); }
.coming-soon-label { padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: color-mix(in oklch, var(--surface-raised) 70%, transparent); backdrop-filter: blur(12px); }
.upcoming-card > div:last-child { position: relative; z-index: 1; max-width: 25ch; }
.upcoming-kicker { margin: 0 0 9px; color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .05em; }
.upcoming-card h3 { margin: 0; color: color-mix(in oklch, var(--text) 84%, var(--muted)); font-size: clamp(1.22rem, 2.3vw, 1.55rem); letter-spacing: -.035em; }
.upcoming-card p:last-child { margin: 12px 0 0; color: var(--quiet); font-size: .82rem; line-height: 1.6; }
@media (max-width: 760px) { .upcoming-grid { grid-template-columns: 1fr; }.upcoming-card { min-height: 220px; } }
</style>
