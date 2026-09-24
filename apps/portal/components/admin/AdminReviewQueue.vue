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
        <h2 id="review-queue-title">待核对队列</h2>
      </div>
      <NuxtLink class="queue-link pressable" to="/admin/reviews">打开队列</NuxtLink>
    </div>

    <div class="queue-table" aria-live="polite">
      <div class="queue-row queue-row--header">
        <span>挑战</span><span>玩家</span><span>状态</span><span>更新时间</span>
      </div>
      <NuxtLink v-for="review in reviews" :key="review.submissionId" class="queue-row queue-row--item pressable-soft" :to="`/admin/reviews/${encodeURIComponent(review.submissionId)}`">
        <span class="queue-challenge"><strong>{{ review.mapName }}</strong><small>{{ review.difficulty }}</small></span>
        <span>{{ review.playerName }}</span>
        <span>{{ review.status }}</span>
        <time>{{ review.updatedAt }}</time>
      </NuxtLink>
      <p v-if="loading" class="queue-empty" role="status">读取中…</p>
      <p v-else-if="!reviews.length" class="queue-empty">暂无待核对。</p>
    </div>
  </section>
</template>

<style scoped>
.review-queue { container-type: inline-size; padding: clamp(var(--space-5), 3vw, var(--space-6)); }
.queue-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-5); padding-bottom: var(--space-5); }
.queue-heading h2 { margin: 0; font-size: var(--type-headline-size); letter-spacing: var(--type-headline-tracking); }
.queue-link { display: inline-flex; min-height: var(--control-lg); align-items: center; color: var(--text); font-size: var(--type-label-sm-size); font-weight: 600; text-decoration: none; white-space: nowrap; }
.queue-table { border-top: 1px solid var(--line); }
.queue-row { display: grid; grid-template-columns: minmax(180px, 1.7fr) minmax(92px, 1fr) minmax(88px, .8fr) minmax(112px, 1fr); gap: var(--space-4); align-items: center; min-height: 60px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: var(--type-label-sm-size); }
.queue-row--header { min-height: 38px; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; letter-spacing: .02em; }
.queue-row--item { color: var(--muted); text-decoration: none; }
.queue-row--item:hover, .queue-row--item:focus-visible { color: var(--text); background: var(--surface-raised); }
.queue-challenge strong, .queue-challenge small { display: block; }
.queue-challenge strong { color: var(--text); font-size: var(--type-label-sm-size); }
.queue-challenge small { margin-top: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); }
.queue-empty { margin: 0; padding: var(--space-8) var(--space-1) var(--space-2); color: var(--quiet); font-size: var(--type-label-sm-size); text-align: center; }
/* Threshold covers the desktop grid's real floor: track minima 180+92+88+112px
   + 3 gaps of --space-4 (48px) = 520px, plus up to 24px of --review-queue
   padding per side (48px) = 568px, so the four-column row never overflows. */
@container (max-width: 35.49rem) {
  .queue-row { grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-1) var(--space-4); padding-block: var(--space-3); }
  .queue-row--header { display: none; }
  .queue-row--item > :nth-child(2) { grid-column: 1; }
  .queue-row--item > :nth-child(3) { grid-column: 2; grid-row: 1; color: var(--quiet); font-size: var(--type-caption-size); }
  .queue-row--item time { grid-column: 1; color: var(--quiet); font-size: var(--type-caption-size); }
}
</style>
