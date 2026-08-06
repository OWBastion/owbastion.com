import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PlayerReviewPanel from "./PlayerReviewPanel.vue";

const api = vi.fn();
mockNuxtImport("usePortalApi", () => () => api);

const summary = {
  contractVersion: "1" as const,
  summary: {
    targetType: "map" as const,
    targetId: "map.samoa",
    averageRating: 4.2,
    reviewCount: 3,
    ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 },
    sampleInsufficient: false,
  },
};
const comments = {
  contractVersion: "1" as const,
  targetType: "map" as const,
  targetId: "map.samoa",
  items: [{ rating: 5 as const, comment: "节奏很好", author: { displayName: "玩家一号" }, createdAt: 1_754_000_000_000 }],
  page: 1,
  pageSize: 5,
  total: 1,
  hasMore: false,
};
const playerReview = {
  reviewId: "4c1f9c1c-6f63-4f4a-9cb0-1af3dbb44579",
  targetType: "map" as const,
  targetId: "map.samoa",
  rating: 4 as const,
  comment: "初始评价",
  anonymous: true,
  createdAt: 1,
  updatedAt: 2,
};

const global = {
  stubs: {
    UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
    UAlert: { props: ["description", "title"], template: "<div role=\"alert\">{{ title }}{{ description }}</div>" },
  },
};

const setupApi = (authenticated: boolean, overrides: Record<string, unknown> = {}) => {
  api.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (overrides[path]) {
      const value = overrides[path];
      if (value instanceof Error) throw value;
      return value;
    }
    if (path.endsWith("/summary")) return summary;
    if (path.includes("/comments?")) return comments;
    if (path.includes("/me/reviews/") && !path.includes("/withdraw")) return { contractVersion: "1", review: authenticated ? playerReview : null };
    if (options?.method === "PUT") return { contractVersion: "1", review: { ...playerReview, rating: 5, comment: "已修改", anonymous: true } };
    if (options?.method === "POST") return { contractVersion: "1", review: null };
    throw new Error("Unexpected API request: " + path);
  });
};

describe("PlayerReviewPanel", () => {
  it("shows a loading state while public review requests are pending", async () => {
    let resolveSummary: (value: typeof summary) => void = () => {};
    let resolveComments: (value: typeof comments) => void = () => {};
    api.mockImplementation((path: string) => {
      if (path.endsWith("/summary")) return new Promise<typeof summary>((resolve) => { resolveSummary = resolve; });
      return new Promise<typeof comments>((resolve) => { resolveComments = resolve; });
    });
    const wrapper = await mountSuspended(PlayerReviewPanel, { props: { targetType: "map", targetId: "map.samoa", authenticated: false }, global });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="status"]').text()).toContain("正在读取评价");
    resolveSummary(summary);
    resolveComments(comments);
    await flushPromises();
    expect(wrapper.text()).toContain("4.2");
  });

  it("shows public results and a login path to guests", async () => {
    setupApi(false);
    const wrapper = await mountSuspended(PlayerReviewPanel, { props: { targetType: "map", targetId: "map.samoa", authenticated: false }, global });
    await flushPromises();

    expect(wrapper.text()).toContain("4.2");
    expect(wrapper.text()).toContain("节奏很好");
    expect(wrapper.text()).toContain("登录后可以提交或修改你的评价");
    expect(wrapper.get(".review-login").attributes("href")).toContain("/login?returnTo=");
    expect(wrapper.find(".review-editor").exists()).toBe(false);
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining("/v1/me/reviews/"), expect.anything());
  });

  it("loads an empty state and anonymous editor for authenticated players", async () => {
    setupApi(true, {
      "/v1/public/reviews/map/map.samoa/summary": { ...summary, summary: { ...summary.summary, averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true } },
      "/v1/public/reviews/map/map.samoa/comments?page=1&pageSize=5": { ...comments, items: [], total: 0 },
      "/v1/me/reviews/map/map.samoa": { contractVersion: "1", review: null },
    });
    const wrapper = await mountSuspended(PlayerReviewPanel, { props: { targetType: "map", targetId: "map.samoa", authenticated: true }, global });
    await flushPromises();

    expect(wrapper.text()).toContain("暂无评分");
    expect(wrapper.text()).toContain("样本不足");
    expect(wrapper.text()).toContain("暂无文字评价");
    expect(wrapper.text()).toContain("匿名展示只对其他玩家隐藏身份");
    expect(wrapper.get(".review-rating-button.selected").text()).toContain("5 星");
  });

  it("preserves the editor flow for edit and anonymous save without duplicate writes", async () => {
    setupApi(true);
    const wrapper = await mountSuspended(PlayerReviewPanel, { props: { targetType: "map", targetId: "map.samoa", authenticated: true }, global });
    await flushPromises();

    await wrapper.get(".review-rating-button[aria-label=\"5 星\"]").trigger("click");
    await wrapper.get("textarea").setValue("已修改");
    const form = wrapper.get("form");
    await Promise.all([form.trigger("submit"), form.trigger("submit")]);
    await flushPromises();

    const writes = api.mock.calls.filter(([path, options]) => path.includes("/v1/me/reviews/map/map.samoa") && options?.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[1]).toMatchObject({ headers: { "Idempotency-Key": expect.any(String) }, body: { rating: 5, comment: "已修改", anonymous: true } });
    expect(wrapper.text()).toContain("评价已保存");
  });

  it("supports withdrawing an existing review", async () => {
    setupApi(true);
    const wrapper = await mountSuspended(PlayerReviewPanel, { props: { targetType: "map", targetId: "map.samoa", authenticated: true }, global });
    await flushPromises();

    await wrapper.get(".review-withdraw").trigger("click");
    await flushPromises();

    const withdrawal = api.mock.calls.find(([path, options]) => path.includes("/withdraw") && options?.method === "POST");
    expect(withdrawal?.[1]).toMatchObject({ headers: { "Idempotency-Key": expect.any(String) }, body: { contractVersion: "1" } });
    expect(wrapper.text()).toContain("评价已撤回");
  });

  it("uses the shared review flow for event targets", async () => {
    setupApi(true);
    const wrapper = await mountSuspended(PlayerReviewPanel, { props: { targetType: "event", targetId: "event.alpha", authenticated: true }, global });
    await flushPromises();

    await wrapper.get("textarea").setValue("事件体验");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(api).toHaveBeenCalledWith("/v1/me/reviews/event/event.alpha", expect.objectContaining({ method: "PUT" }));
    expect(wrapper.text()).toContain("评价已保存");
  });

  it("shows a retryable error without losing the current editor", async () => {
    setupApi(true, { "/v1/public/reviews/map/map.samoa/summary": Object.assign(new Error("unavailable"), { statusCode: 503 }) });
    const wrapper = await mountSuspended(PlayerReviewPanel, { props: { targetType: "map", targetId: "map.samoa", authenticated: true }, global });
    await flushPromises();

    expect(wrapper.get(".review-editor").exists()).toBe(true);
    expect(wrapper.text()).toContain("评价暂时无法读取");
    expect(wrapper.get(".review-retry").exists()).toBe(true);
  });
});
