<script setup lang="ts">
import type { PublicReviewComment, ReviewRating, ReviewSummary } from "~/composables/usePlayerReview";

const props = defineProps<{
  summary: ReviewSummary | null;
  comments: PublicReviewComment[];
  loading: boolean;
  page: number;
  total: number;
  hasMore: boolean;
}>();

const emit = defineEmits<{ page: [number] }>();
const ratings: ReviewRating[] = [5, 4, 3, 2, 1];

const averageLabel = computed(() => props.summary?.averageRating == null ? "暂无评分" : props.summary.averageRating.toFixed(1));
const distributionMax = computed(() => Math.max(...ratings.map((rating) => props.summary?.ratingDistribution[rating] ?? 0), 1));
const distributionWidth = (rating: ReviewRating) => Math.round(((props.summary?.ratingDistribution[rating] ?? 0) / distributionMax.value) * 100) + "%";
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(timestamp));
</script>

<template>
  <div class="review-summary" aria-live="polite">
    <div v-if="loading" class="review-loading" role="status">正在读取评价…</div>
    <template v-else>
      <div class="review-summary-overview">
        <div class="review-average"><strong>{{ averageLabel }}</strong><span>{{ summary?.reviewCount ?? 0 }} 条有效评价</span></div>
        <div class="review-distribution" aria-label="评分分布">
          <div v-for="rating in ratings" :key="rating" class="review-distribution-row">
            <span>{{ rating }} 星</span>
            <div class="review-distribution-track" role="progressbar" :aria-label="rating + ' 星评价数量'" :aria-valuenow="summary?.ratingDistribution[rating] ?? 0" aria-valuemin="0" :aria-valuemax="distributionMax"><span :style="{ width: distributionWidth(rating) }"></span></div>
            <span>{{ summary?.ratingDistribution[rating] ?? 0 }}</span>
          </div>
        </div>
      </div>
      <p v-if="summary?.sampleInsufficient" class="review-sample-note">样本不足，评分仅供参考。</p>
      <div class="review-comments" aria-labelledby="review-comments-title">
        <div class="review-subsection-heading"><h4 id="review-comments-title">玩家评价</h4><span>{{ total }} 条</span></div>
        <p v-if="!comments.length" class="review-empty">暂无文字评价。</p>
        <ul v-else class="review-comment-list">
          <li v-for="(item, index) in comments" :key="item.createdAt + '-' + index" class="review-comment">
            <div class="review-comment-meta"><span>{{ item.author?.displayName ?? "匿名评价" }}</span><span>{{ item.rating }} 星 · {{ formatDate(item.createdAt) }}</span></div>
            <p>{{ item.comment || "未填写文字内容" }}</p>
          </li>
        </ul>
        <div v-if="total > 0" class="review-pagination" aria-label="评价分页">
          <button class="review-page-button" type="button" :disabled="loading || page <= 1" @click="emit('page', page - 1)">上一页</button>
          <span>第 {{ page }} 页</span>
          <button class="review-page-button" type="button" :disabled="loading || !hasMore" @click="emit('page', page + 1)">下一页</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.review-summary { display: grid; gap: 16px; }.review-loading, .review-empty { margin: 0; color: var(--quiet); font-size: .84rem; }.review-summary-overview { display: grid; grid-template-columns: minmax(94px, .7fr) minmax(0, 1.3fr); gap: 22px; align-items: center; }.review-average { display: grid; gap: 5px; }.review-average strong { color: var(--text); font-size: clamp(1.8rem, 5vw, 2.5rem); letter-spacing: -.06em; }.review-average span, .review-subsection-heading > span, .review-comment-meta { color: var(--muted); font-size: .76rem; }.review-distribution { display: grid; gap: 6px; }.review-distribution-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) 20px; gap: 8px; align-items: center; color: var(--muted); font-size: .72rem; }.review-distribution-track { height: 7px; overflow: hidden; border-radius: 999px; background: var(--surface-raised); }.review-distribution-track span { display: block; height: 100%; border-radius: inherit; background: var(--accent); }.review-sample-note { margin: 0; color: var(--quiet); font-size: .76rem; }.review-comments { display: grid; gap: 11px; }.review-subsection-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }.review-subsection-heading h4 { margin: 0; color: var(--text); font-size: .9rem; }.review-comment-list { display: grid; gap: 9px; padding: 0; margin: 0; list-style: none; }.review-comment { display: grid; gap: 7px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: color-mix(in oklch, var(--surface-raised) 56%, transparent); }.review-comment-meta { display: flex; justify-content: space-between; gap: 10px; }.review-comment p { margin: 0; color: var(--text); font-size: .82rem; line-height: 1.55; overflow-wrap: anywhere; }.review-pagination { display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--muted); font-size: .76rem; }.review-page-button { min-width: 44px; min-height: 44px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--text); background: var(--surface); font: inherit; }.review-page-button:disabled { cursor: not-allowed; opacity: .45; }.review-page-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 360px) { .review-summary-overview { grid-template-columns: 1fr; gap: 14px; } }
@media (prefers-reduced-motion: reduce) { .review-summary * { scroll-behavior: auto; } }
@media (prefers-contrast: more) { .review-distribution-track { border: 1px solid var(--line-strong); } .review-comment { border-color: var(--line-strong); } }
</style>
