<script setup lang="ts">
type DashboardReview = {
  submissionId: string;
  mapName: string;
  difficulty: string;
  playerName: string;
  status: string;
  updatedAt: string;
};

defineProps<{ loading: boolean; reviews: DashboardReview[] }>();
</script>

<template>
  <section class="review-queue surface-card" aria-labelledby="review-queue-title">
    <div class="queue-heading">
      <div>
        <p class="eyebrow">当前工作</p>
        <h2 id="review-queue-title">待核对队列</h2>
      </div>
      <NuxtLink class="queue-link" to="/admin/reviews">查看全部 <span aria-hidden="true">→</span></NuxtLink>
    </div>

    <div class="queue-table" role="table" aria-live="polite">
      <div class="queue-row queue-row--header" role="row">
        <span role="columnheader">挑战</span><span role="columnheader">玩家</span><span role="columnheader">状态</span><span role="columnheader">更新时间</span>
      </div>
      <NuxtLink v-for="review in reviews" :key="review.submissionId" class="queue-row queue-row--item" role="row" to="/admin/reviews">
        <span class="queue-challenge" role="cell"><strong>{{ review.mapName }}</strong><small>{{ review.difficulty }}</small></span>
        <span role="cell">{{ review.playerName }}</span>
        <span role="cell">{{ review.status }}</span>
        <time role="cell">{{ review.updatedAt }}</time>
      </NuxtLink>
      <p v-if="loading" class="queue-empty" role="status">读取中…</p>
      <p v-else-if="!reviews.length" class="queue-empty">暂无待核对。</p>
    </div>
  </section>
</template>

<style scoped>
.review-queue { padding:clamp(20px,3vw,28px); }.queue-heading { display:flex; align-items:end; justify-content:space-between; gap:20px; padding-bottom:20px; }.queue-heading .eyebrow { margin-bottom:6px; }.queue-heading h2 { margin:0; font-size:clamp(1.4rem,3vw,2rem); letter-spacing:-.05em; }.queue-link { color:var(--text); font-size:.8rem; font-weight:650; text-decoration:none; white-space:nowrap; }.queue-link span { margin-left:5px; color:var(--accent); }.queue-table { border-top:1px solid var(--line); }.queue-row { display:grid; grid-template-columns:minmax(180px,1.7fr) minmax(92px,1fr) minmax(88px,.8fr) minmax(112px,1fr); gap:14px; align-items:center; min-height:60px; border-bottom:1px solid var(--line); color:var(--muted); font-size:.8rem; }.queue-row--header { min-height:38px; color:var(--quiet); font-size:.68rem; font-weight:650; letter-spacing:.02em; }.queue-row--item { color:var(--muted); text-decoration:none; transition:color 160ms ease,background 160ms ease; }.queue-row--item:hover,.queue-row--item:focus-visible { color:var(--text); background:var(--surface-raised); }.queue-challenge strong,.queue-challenge small { display:block; }.queue-challenge strong { color:var(--text); font-size:.84rem; }.queue-challenge small { margin-top:3px; color:var(--quiet); font-size:.72rem; }.queue-empty { margin:0; padding:32px 4px 8px; color:var(--quiet); font-size:.82rem; text-align:center; }
@media (max-width:620px) { .queue-row { grid-template-columns:minmax(0,1fr) auto; gap:5px 14px; padding-block:13px; }.queue-row--header { display:none; }.queue-row--item > :nth-child(2) { grid-column:1; }.queue-row--item > :nth-child(3) { grid-column:2; grid-row:1; color:var(--quiet); font-size:.72rem; }.queue-row--item time { grid-column:1; color:var(--quiet); font-size:.72rem; } }
</style>
