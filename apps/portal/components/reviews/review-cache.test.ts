import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerReview } from "~/composables/usePlayerReview";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.stubGlobal("$fetch", api);

const summary = (targetId: string) => ({ targetType: "event", targetId, averageRating: 4, ratingCount: 2 });
const respond = (url: string) => {
  if (url.includes("/summary")) return Promise.resolve({ contractVersion: "1", summary: summary("e") });
  if (url.includes("/comments")) return Promise.resolve({ contractVersion: "1", items: [], page: 1, pageSize: 5, total: 0, hasMore: false });
  return Promise.resolve({ contractVersion: "1", review: null });
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const urls = () => api.mock.calls.map(([url]) => String(url));

describe("player review panel cache", () => {
  beforeEach(() => { api.mockReset(); api.mockImplementation(respond); });

  it("serves a reopened event from cache without new requests", async () => {
    usePlayerReview("event", "cache-reopen", true);
    await flush();
    expect(api).toHaveBeenCalledTimes(3);

    const reopened = usePlayerReview("event", "cache-reopen", true);
    expect(reopened.loading.value).toBe(false);
    expect(reopened.summary.value).toMatchObject({ ratingCount: 2 });
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("skips the summary request when the list already supplied it", async () => {
    usePlayerReview("event", "cache-known", true, null, summary("cache-known") as never);
    await flush();
    expect(urls().some((url) => url.includes("/summary"))).toBe(false);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a guest snapshot for a signed-in player", async () => {
    usePlayerReview("event", "cache-auth", false);
    await flush();
    api.mockClear();
    usePlayerReview("event", "cache-auth", true);
    await flush();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("refetches after saving so the cache holds the new review", async () => {
    const review = usePlayerReview("event", "cache-save", true);
    await flush();
    api.mockImplementation((url: string, options?: { method?: string }) => options?.method === "PUT"
      ? Promise.resolve({ contractVersion: "1", review: { reviewId: "r1", rating: 5, comment: null, anonymous: false } })
      : url.includes("/me/reviews/") ? Promise.resolve({ contractVersion: "1", review: { reviewId: "r1", rating: 5, comment: null, anonymous: false } }) : respond(url));
    await review.save();
    api.mockClear();
    const reopened = usePlayerReview("event", "cache-save", true);
    expect(api).not.toHaveBeenCalled();
    expect(reopened.currentReview.value).toMatchObject({ reviewId: "r1" });
  });
});
