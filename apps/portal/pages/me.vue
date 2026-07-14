<script setup lang="ts">
definePageMeta({ middleware: "auth-client" });
useSeoMeta({ title: "我的中心 · 躲避堡垒 3" });

const { player, refresh } = useCurrentPlayer();
const loading = ref(true);

const statusText: Record<string, string> = {
  received: "已收到",
  evidence_pending: "正在保存截图",
  evidence_stored: "截图已保存",
  ocr_pending: "等待识别",
  resubmission_required: "需要重新提交",
};

const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);

onMounted(async () => {
  await refresh();
  loading.value = false;
});
</script>

<template>
  <main class="me-page page-shell">
    <template v-if="player">
      <section class="intro" aria-labelledby="dashboard-title">
        <div class="intro-status"><p class="eyebrow">玩家中心</p><StatusBadge label="身份已绑定" tone="success" /></div>
        <h1 id="dashboard-title" class="page-title">你好，{{ player.player.playerName }}</h1>
        <p class="body-copy">这里汇总你已绑定身份下的挑战进度。审核、发放和发布会继续保持各自独立的状态。</p>
      </section>

      <section class="identity-card surface-card" aria-label="玩家身份">
        <div><p class="field-label">玩家名称</p><strong>{{ player.player.playerName }}</strong></div>
        <div><p class="field-label">玩家 ID</p><strong>{{ player.player.playerId }}</strong></div>
        <div><p class="field-label">QQ 绑定</p><StatusBadge label="已绑定" tone="success" /></div>
      </section>

      <section class="section-block" aria-labelledby="submissions-title">
        <div class="section-heading"><div><p class="eyebrow">最近提交</p><h2 id="submissions-title">你的挑战进度</h2></div><span>最近 5 条</span></div>
        <div v-if="player.recentSubmissions.length" class="submission-list">
          <NuxtLink v-for="submission in player.recentSubmissions" :key="submission.submissionId" :to="`/submissions/${submission.submissionId}`" class="submission-row surface-card">
            <div><strong>{{ submission.mapName }}</strong><span>{{ formatTime(submission.updatedAt) }}</span></div>
            <StatusBadge :label="statusText[submission.status] ?? submission.status" :tone="submission.status === 'resubmission_required' ? 'warning' : 'default'" />
          </NuxtLink>
        </div>
        <EmptyState v-else title="还没有提交记录" description="完成挑战后，在 QQ 群中发送截图提交；新的进度会显示在这里。" />
      </section>

      <section class="upcoming-section" aria-labelledby="upcoming-title">
        <div class="section-heading upcoming-heading"><div><p class="eyebrow">探索更多</p><h2 id="upcoming-title">即将到来</h2></div><p>新的个人进度会在可确认后显示在这里。</p></div>
        <div class="upcoming-grid">
          <article class="upcoming-card surface-card">
            <div class="upcoming-card-top"><span class="upcoming-index">01</span><span class="coming-soon-label">即将到来</span></div>
            <div><p class="upcoming-kicker">个人收藏</p><h3>成就与称号</h3><p>查看已确认的成就记录，以及随发布状态更新的称号。</p></div>
          </article>
          <article class="upcoming-card surface-card">
            <div class="upcoming-card-top"><span class="upcoming-index">02</span><span class="coming-soon-label">即将到来</span></div>
            <div><p class="upcoming-kicker">限时目标</p><h3>轮换挑战</h3><p>在开放窗口内查看当前挑战、参与条件和完成记录。</p></div>
          </article>
          <article class="upcoming-card surface-card">
            <div class="upcoming-card-top"><span class="upcoming-index">03</span><span class="coming-soon-label">即将到来</span></div>
            <div><p class="upcoming-kicker">地图记录</p><h3>地图挑战进度</h3><p>按地图查看已提交的挑战与等待确认的进展。</p></div>
          </article>
        </div>
      </section>
    </template>
    <p v-else-if="loading" class="loading">正在读取你的玩家中心……</p>
  </main>
</template>

<style scoped>
.me-page { padding-block: clamp(88px, 13vh, 145px) 72px; }
.intro { max-width: 690px; margin-bottom: 42px; }
.intro-status { display: flex; align-items: center; gap: 11px; }
.intro-status .eyebrow { margin-bottom: .8rem; }
.intro-status .status-badge { margin-bottom: .8rem; }
.intro .body-copy { max-width: 52ch; margin: 22px 0 0; }
.identity-card { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 25px; }
.field-label { margin: 0 0 8px; color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .05em; }
.identity-card strong { font-size: 1.05rem; letter-spacing: -.02em; }
.section-block, .upcoming-section { margin-top: clamp(66px, 10vw, 110px); }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.section-heading .eyebrow { margin-bottom: 10px; }
.section-heading h2 { margin: 0; font-size: clamp(1.65rem, 3vw, 2.35rem); letter-spacing: -.045em; }
.section-heading > span { color: var(--quiet); font-size: .78rem; }
.submission-list { display: grid; gap: 10px; }
.submission-row { display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 18px 20px; color: inherit; text-decoration: none; transition: transform 160ms ease, border-color 160ms ease; }
.submission-row:hover { transform: translateY(-1px); border-color: var(--line-strong); }
.submission-row strong { display: block; letter-spacing: -.02em; }
.submission-row span:not(.status-badge) { display: block; margin-top: 5px; color: var(--quiet); font-size: .78rem; }
.upcoming-heading > p { max-width: 30ch; margin: 0; color: var(--quiet); font-size: .8rem; line-height: 1.55; text-align: right; }
.upcoming-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.upcoming-card { position: relative; display: flex; min-height: 272px; flex-direction: column; justify-content: space-between; overflow: hidden; padding: 22px; background: color-mix(in oklch, var(--surface-raised) 72%, var(--surface)); }
.upcoming-card::after { position: absolute; inset: auto -16% -36% auto; width: 165px; height: 165px; border-radius: 50%; background: oklch(54% .045 55 / 16%); filter: blur(18px); content: ""; }
.upcoming-card-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--quiet); font-size: .68rem; font-weight: 720; letter-spacing: .08em; }
.upcoming-index { color: color-mix(in oklch, var(--quiet) 75%, transparent); }
.coming-soon-label { padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: oklch(18% .012 48 / 48%); backdrop-filter: blur(12px); }
.upcoming-card > div:last-child { position: relative; z-index: 1; max-width: 25ch; }
.upcoming-kicker { margin: 0 0 9px; color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .05em; }
.upcoming-card h3 { margin: 0; color: color-mix(in oklch, var(--text) 84%, var(--muted)); font-size: clamp(1.22rem, 2.3vw, 1.55rem); letter-spacing: -.035em; }
.upcoming-card p:last-child { margin: 12px 0 0; color: var(--quiet); font-size: .82rem; line-height: 1.6; }
.loading { padding-block: 180px; color: var(--muted); text-align: center; }
@media (max-width: 760px) { .upcoming-grid { grid-template-columns: 1fr; }.upcoming-card { min-height: 220px; }.upcoming-heading { align-items: flex-start; flex-direction: column; }.upcoming-heading > p { text-align: left; } }
@media (max-width: 620px) { .identity-card { grid-template-columns: 1fr; gap: 18px; }.submission-row { align-items: flex-start; flex-direction: column; gap: 12px; } }
</style>
