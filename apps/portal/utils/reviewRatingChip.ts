import type { ReviewSummary } from "~/composables/usePlayerReview";

export type ReviewRatingChip = { label: string; tone: "accent" | "default"; icon: "★" };

export const reviewRatingChip = (summary: ReviewSummary | null, loading: boolean, error?: string): ReviewRatingChip => {
  if (loading) return { label: "读取中…", tone: "default", icon: "★" };
  if (error) return { label: "评分暂不可用", tone: "default", icon: "★" };
  if (!summary || summary.averageRating === null) return { label: "暂无评分", tone: "accent", icon: "★" };
  return { label: `${summary.averageRating.toFixed(1)} 分 · ${summary.reviewCount} 条`, tone: "accent", icon: "★" };
};
