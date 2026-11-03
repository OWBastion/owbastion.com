import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeReviews from "./HomeReviews.vue";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
mockNuxtImport("usePortalApi", () => () => api);

describe("home featured reviews", () => {
  beforeEach(() => clearNuxtData("home-featured-reviews"));

  it("shows each featured comment with its rating and event, anonymously", async () => {
    api.mockResolvedValue({ contractVersion: "1", items: [{ rating: 5, comment: "这个事件很有意思，值得推荐", targetName: "有点松弛" }, { rating: 4, comment: "一个人扛全场的感觉很刺激", targetName: "我独自闯关" }] });
    const wrapper = await mountSuspended(HomeReviews);
    expect(api).toHaveBeenCalledWith("/v1/public/reviews/featured");
    const cards = wrapper.findAll("article");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain("这个事件很有意思，值得推荐");
    expect(cards[0]!.text()).toContain("有点松弛");
    expect(cards[0]!.find("[aria-label='5 分']").exists()).toBe(true);
    expect(cards[1]!.find("[aria-label='4 分']").exists()).toBe(true);
  });

  it.each([
    ["no comments qualify", () => Promise.resolve({ contractVersion: "1", items: [] })],
    ["the read fails", () => Promise.reject(new Error("offline"))],
  ])("renders nothing when %s", async (_name, result) => {
    api.mockImplementation(result);
    const wrapper = await mountSuspended(HomeReviews);
    expect(wrapper.find("section").exists()).toBe(false);
  });
});
