<script setup lang="ts">
import type { ReviewSummary } from "~/composables/usePlayerReview";

const props = defineProps<{
  summary: ReviewSummary | null;
  loading: boolean;
  error?: string;
}>();

const label = computed(() => {
  if (props.loading) return "读取中…";
  if (props.error) return "评分暂不可用";
  if (!props.summary || props.summary.averageRating === null) return "暂无评分";
  return `${props.summary.averageRating.toFixed(1)} 分 · ${props.summary.reviewCount} 条`;
});
const detail = computed(() => props.summary?.sampleInsufficient ? "样本不足，评分仅供参考" : undefined);
</script>

<template>
  <span class="review-summary-badge" :class="{ unavailable: error }" :aria-label="detail ? `${label}，${detail}` : label">
    <span aria-hidden="true">★</span>
    <span>{{ label }}</span>
    <small v-if="detail">样本不足</small>
  </span>
</template>

<style scoped>
.review-summary-badge { display: inline-flex; min-height: 24px; align-items: center; gap: 5px; max-width: 100%; padding: 3px 8px; border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--line)); border-radius: 999px; color: var(--text); background: color-mix(in oklch, var(--accent-surface) 42%, var(--surface)); font-size: .72rem; font-weight: 650; line-height: 1.2; }.review-summary-badge > span:first-child { color: var(--accent); }.review-summary-badge small { color: var(--quiet); font-size: .66rem; font-weight: 550; }.review-summary-badge.unavailable { border-color: var(--line-strong); color: var(--quiet); background: var(--surface); }.review-summary-badge.unavailable > span:first-child { color: var(--quiet); }
@media (prefers-reduced-transparency: reduce) { .review-summary-badge { background: var(--surface-raised); } }
@media (prefers-contrast: more) { .review-summary-badge { border-color: var(--text); } }
</style>
