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
      <section class="intro">
        <p class="eyebrow">玩家中心</p>
        <h1 class="page-title">你好，{{ player.player.playerName }}</h1>
        <p class="body-copy">这里汇总你已绑定身份下的提交进度。审核、发放和发布会继续保持各自独立的状态。</p>
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

      <section class="titles-card surface-card" aria-labelledby="titles-title"><p class="eyebrow">称号</p><h2 id="titles-title">即将到来</h2><p>称号展示将在发放与发布状态接入后开放。现在不会显示尚未确认的数据。</p></section>
    </template>
    <p v-else-if="loading" class="loading">正在读取你的玩家中心……</p>
  </main>
</template>

<style scoped>
.me-page { padding-block: clamp(88px, 13vh, 145px) 72px; }.intro { max-width: 690px; margin-bottom: 42px; }.intro .body-copy { max-width: 52ch; margin: 22px 0 0; }.identity-card { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 25px; }.field-label { margin: 0 0 8px; color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .05em; }.identity-card strong { font-size: 1.05rem; letter-spacing: -.02em; }.section-block { margin-top: clamp(66px, 10vw, 110px); }.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }.section-heading .eyebrow { margin-bottom: 10px; }.section-heading h2, .titles-card h2 { margin: 0; font-size: clamp(1.65rem, 3vw, 2.35rem); letter-spacing: -.045em; }.section-heading > span { color: var(--quiet); font-size: .78rem; }.submission-list { display: grid; gap: 10px; }.submission-row { display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 18px 20px; color: inherit; text-decoration: none; transition: transform 160ms ease, border-color 160ms ease; }.submission-row:hover { transform: translateY(-1px); border-color: var(--line-strong); }.submission-row strong { display: block; letter-spacing: -.02em; }.submission-row span:not(.status-badge) { display: block; margin-top: 5px; color: var(--quiet); font-size: .78rem; }.titles-card { margin-top: clamp(66px, 10vw, 110px); padding: clamp(26px, 4vw, 40px); background: var(--surface-raised); }.titles-card .eyebrow { margin-bottom: 12px; }.titles-card p:last-child { max-width: 50ch; margin: 16px 0 0; color: var(--muted); line-height: 1.6; }.loading { padding-block: 180px; color: var(--muted); text-align: center; } @media (max-width: 620px) { .identity-card { grid-template-columns: 1fr; gap: 18px; }.submission-row { align-items: flex-start; flex-direction: column; gap: 12px; } }
</style>
