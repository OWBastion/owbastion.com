import { describe, expect, it } from "vitest";
import { reviewRatingChip } from "./reviewRatingChip";

import type { ReviewSummary } from "~/composables/usePlayerReview";

const summary: ReviewSummary = { targetType: "map", targetId: "map.samoa", averageRating: 4.6, reviewCount: 2, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 }, sampleInsufficient: false };

describe("reviewRatingChip", () => {
  it("shows 暂无评分 without a rating", () => {
    expect(reviewRatingChip(null, false)).toEqual({ label: "暂无评分", tone: "accent" });
    expect(reviewRatingChip({ ...summary, averageRating: null, reviewCount: 0 }, false).label).toBe("暂无评分");
  });

  it("shows any rating normally, however few reviews", () => {
    expect(reviewRatingChip({ ...summary, reviewCount: 1 }, false)).toEqual({ label: "4.6 分 · 1 条", tone: "accent" });
  });

  it("ignores sampleInsufficient and still shows the rating", () => {
    expect(reviewRatingChip({ ...summary, reviewCount: 1, sampleInsufficient: true }, false)).toEqual({ label: "4.6 分 · 1 条", tone: "accent" });
  });

  it("uses the default tone while loading or unavailable", () => {
    expect(reviewRatingChip(null, true)).toEqual({ label: "读取中…", tone: "default" });
    expect(reviewRatingChip(null, false, "x")).toEqual({ label: "评分暂不可用", tone: "default" });
  });
});
