import type { ReviewSummary } from "~/composables/usePlayerReview";

export type ReviewRatingChip = { label: string; tone: "accent" | "default" };

export const reviewRatingChip = (summary: ReviewSummary | null, loading: boolean, error?: string): ReviewRatingChip => {
  if (loading) return { label: "读取中…", tone: "default" };
  if (error) return { label: "评分暂不可用", tone: "default" };
  if (!summary || summary.averageRating === null) return { label: "暂无评分", tone: "accent" };
  return { label: `${summary.averageRating.toFixed(1)} 分 · ${summary.reviewCount} 条`, tone: "accent" };
};
