import { describe, expect, it } from "vitest";
import { defaultReviewQueueOrder } from "./reviewQueue";

describe("defaultReviewQueueOrder", () => {
  it("treats the unfiltered queue as the default, oldest first", () => {
    expect(defaultReviewQueueOrder("/admin/reviews")).toBe("oldest");
    expect(defaultReviewQueueOrder("/admin/reviews?page=3&spotCheck=all")).toBe("oldest");
  });

  it("keeps an explicit order", () => {
    expect(defaultReviewQueueOrder("/admin/reviews?order=newest")).toBe("newest");
  });

  it("has no next item while the maintainer browses a filtered view", () => {
    expect(defaultReviewQueueOrder("/admin/reviews?status=all")).toBeNull();
    expect(defaultReviewQueueOrder("/admin/reviews?status=approved&page=2")).toBeNull();
    expect(defaultReviewQueueOrder("/admin/reviews?spotCheck=pending")).toBeNull();
  });
});
