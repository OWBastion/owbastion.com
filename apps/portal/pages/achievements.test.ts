import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import AchievementsPage from "./achievements.vue";

const currentPlayer = ref<{ player: { playerId: string; playerName: string; bindingStatus: "bound"; isAdmin: boolean }; recentSubmissions: never[] } | null>(null);
const ownedTitles = ref<any[]>([]);
const refreshPlayer = vi.fn(async () => currentPlayer.value);
const refreshTitles = vi.fn(async () => ownedTitles.value);
const portalApi = vi.fn(async (path: string) => {
  if (path === "/v1/public/achievements") return { items: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: null, category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual" }] };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player: currentPlayer, refresh: refreshPlayer }));
mockNuxtImport("usePlayerTitles", () => () => ({ items: ownedTitles, refresh: refreshTitles }));
mockNuxtImport("usePortalApi", () => () => portalApi);

describe("achievements page", () => {
  it("renders the public catalog for signed-out visitors", async () => {
    currentPlayer.value = null;
    ownedTitles.value = [];
    const wrapper = await mountSuspended(AchievementsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("测试称号");
    expect(wrapper.text()).not.toContain("已获得");
    expect(refreshTitles).not.toHaveBeenCalled();
  });

  it("renders the signed-in player's achievement overview and historical titles", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] };
    ownedTitles.value = [{ grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2 }, { grantId: "grant-2", titleKey: "OLD", label: "历史称号", icon: "scroll", category: "旧记录", condition: "旧条件", scope: "global", grantedAt: 1 }];
    const wrapper = await mountSuspended(AchievementsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("我的成就");
    expect(wrapper.text()).toContain("完成率");
    expect(wrapper.text()).toContain("100%");
    expect(wrapper.text()).toContain("最近获得");
    expect(wrapper.findAll(".earned-status")).toHaveLength(2);
    expect(wrapper.text()).toContain("历史称号");
    expect(refreshTitles).toHaveBeenCalled();
  });

  it("shows an error when the personal achievement data cannot be loaded", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] };
    refreshTitles.mockRejectedValueOnce(new Error("unavailable"));
    const wrapper = await mountSuspended(AchievementsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("无法读取成就");
  });
});
