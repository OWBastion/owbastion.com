<script setup lang="ts">
import type { PublicReviewComment, ReviewRating, ReviewSummary } from "~/composables/usePlayerReview";

const props = defineProps<{
  summary: ReviewSummary | null;
  comments: PublicReviewComment[];
  loading: boolean;
  page: number;
  hasMore: boolean;
}>();

const emit = defineEmits<{ page: [number] }>();
const ratings: ReviewRating[] = [5, 4, 3, 2, 1];

const averageParts = computed(() => props.summary?.averageRating == null ? null : props.summary.averageRating.toFixed(1).split("."));
const distributionMax = computed(() => Math.max(...ratings.map((rating) => props.summary?.ratingDistribution[rating] ?? 0), 1));
const distributionWidth = (rating: ReviewRating) => Math.round(((props.summary?.ratingDistribution[rating] ?? 0) / distributionMax.value) * 100) + "%";
</script>

<template>
  <div class="review-summary" aria-live="polite">
    <div v-if="loading" class="review-loading" role="status">读取中…</div>
    <template v-else>
      <div class="review-summary-overview">
        <div class="review-average"><strong :class="{ empty: !averageParts }"><template v-if="averageParts">{{ averageParts[0] }}<span class="review-dot" role="presentation"></span><span class="sr-only">.</span>{{ averageParts[1] }}</template><template v-else>暂无评分</template></strong><span v-if="summary?.reviewCount">{{ summary.reviewCount }} 条</span></div>
        <div v-if="summary?.reviewCount" class="review-distribution" aria-label="评分分布">
          <div v-for="rating in ratings" :key="rating" class="review-distribution-row">
            <span>{{ rating }} 星</span>
            <div class="review-distribution-track" role="progressbar" :aria-label="rating + ' 星评价数量'" :aria-valuenow="summary?.ratingDistribution[rating] ?? 0" aria-valuemin="0" :aria-valuemax="distributionMax"><span :style="{ width: distributionWidth(rating) }"></span></div>
            <span>{{ summary?.ratingDistribution[rating] ?? 0 }}</span>
          </div>
        </div>
      </div>
      <div v-if="comments.length" class="review-comments" aria-label="玩家评价">
        <ul class="review-comment-list stacked-list">
          <li v-for="(item, index) in comments" :key="item.createdAt + '-' + index" class="review-comment">
            <div class="review-comment-meta"><span>{{ item.author?.displayName ?? "匿名" }}</span><span class="num">★ {{ item.rating }}</span></div>
            <p v-if="item.comment">{{ item.comment }}</p>
          </li>
        </ul>
        <div v-if="page > 1 || hasMore" class="review-pagination" aria-label="评价分页">
          <UButton type="button" color="neutral" variant="outline" label="上一页" :disabled="loading || page <= 1" @click="emit('page', page - 1)" />
          <span>第 {{ page }} 页</span>
          <UButton type="button" color="neutral" variant="outline" label="下一页" :disabled="loading || !hasMore" @click="emit('page', page + 1)" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.review-summary { container-type: inline-size; display: grid; gap: var(--space-4); }
.review-loading { margin: 0; color: var(--quiet); font-size: .84rem; }
.review-summary-overview:has(.review-distribution) { grid-template-columns: minmax(94px, .7fr) minmax(0, 1.3fr); }
.review-summary-overview { display: grid; gap: var(--space-5); align-items: center; }
.review-average { display: grid; gap: var(--space-1); }
.review-average strong { color: var(--text); font-size: clamp(1.8rem, 5vw, 2.5rem); letter-spacing: 0; font-variant-numeric: tabular-nums; }
.review-average strong.empty { font-size: 1.4rem; white-space: nowrap; }
.review-average .review-dot { display: inline-block; width: .18em; height: .18em; margin-inline: .08em; font-size: inherit; border-radius: var(--radius-pill); background: currentColor; }
.review-average span, .review-comment-meta { color: var(--muted); font-size: .76rem; }
.review-distribution { display: grid; gap: var(--space-2); }
.review-distribution-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) 20px; gap: var(--space-2); align-items: center; color: var(--muted); font-size: .72rem; }
.review-distribution-track { height: 7px; overflow: hidden; border-radius: var(--radius-pill); background: var(--surface-raised); }
.review-distribution-track span { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
.review-comments { display: grid; gap: var(--space-3); }
.review-comment { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: color-mix(in oklch, var(--surface-raised) 56%, transparent); }
.review-comment-meta { display: flex; justify-content: space-between; gap: var(--space-2); }
.review-comment p { margin: 0; color: var(--text); font-size: .82rem; line-height: 1.55; overflow-wrap: anywhere; }
.review-pagination { display: flex; align-items: center; justify-content: center; gap: var(--space-2); color: var(--muted); font-size: .76rem; }
@container (max-width: 23.99rem) {
  .review-summary-overview { grid-template-columns: 1fr; gap: var(--space-3); }
}
@media (prefers-reduced-motion: reduce) { .review-summary * { scroll-behavior: auto; } }
@media (prefers-contrast: more) { .review-distribution-track { border: 1px solid var(--line-strong); } .review-comment { border-color: var(--line-strong); } }
</style>
