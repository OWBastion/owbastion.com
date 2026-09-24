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
        <span class="queue-cell">挑战</span><span class="queue-cell">玩家</span><span class="queue-cell">状态</span><span class="queue-cell">更新时间</span>
      </div>
      <NuxtLink v-for="review in reviews" :key="review.submissionId" class="queue-row queue-row--item pressable-soft" :to="`/admin/reviews/${encodeURIComponent(review.submissionId)}`">
        <span class="queue-challenge"><strong class="queue-cell">{{ review.mapName }}</strong><small class="queue-cell">{{ review.difficulty }}</small></span>
        <span class="queue-cell">{{ review.playerName }}</span>
        <span class="queue-cell">{{ review.status }}</span>
        <time class="queue-cell">{{ review.updatedAt }}</time>
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
.queue-row { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr) minmax(0, .8fr) minmax(0, 1fr); gap: var(--space-4); align-items: center; min-height: 60px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: var(--type-label-sm-size); }
.queue-row--header { min-height: 38px; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; letter-spacing: .02em; }
.queue-row--item { color: var(--muted); text-decoration: none; }
.queue-row--item:hover, .queue-row--item:focus-visible { color: var(--text); background: var(--surface-raised); }
.queue-challenge { display: grid; min-width: 0; }
.queue-cell { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queue-challenge strong.queue-cell { color: var(--text); font-size: var(--type-label-sm-size); }
.queue-challenge small.queue-cell { margin-top: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); }
.queue-empty { margin: 0; padding: var(--space-8) var(--space-1) var(--space-2); color: var(--quiet); font-size: var(--type-label-sm-size); text-align: center; }
/* Every column track is fluid (minmax(0, fr)) and every cell truncates with
   an ellipsis, so the four-column row keeps working at any container width
   down to the cq-compact floor without a custom breakpoint of its own. */
@container (max-width: 23.99rem) {
  .queue-row { grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-1) var(--space-4); padding-block: var(--space-3); }
  .queue-row--header { display: none; }
  .queue-row--item > :nth-child(2) { grid-column: 1; }
  .queue-row--item > :nth-child(3) { grid-column: 2; grid-row: 1; color: var(--quiet); font-size: var(--type-caption-size); }
  .queue-row--item time { grid-column: 1; color: var(--quiet); font-size: var(--type-caption-size); }
}
</style>
