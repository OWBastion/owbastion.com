import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import MyAchievementsPage from "./index.vue";

const player = ref<any>({ player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] });
const ownedTitles = ref<any[]>([]);
const allTitles = ref(false);
const challengeProgress = ref<any[]>([]);
const refreshTitles = vi.fn(async () => ownedTitles.value);
const refreshChallengeProgress = vi.fn(async () => challengeProgress.value);
const replaceEquipped = vi.fn(async (grantIds: string[]) => ({ grantIds }));
const publicCatalog = vi.fn(async (name: string) => {
  if (name === "achievements") return { items: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: null, category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual", progressRule: { type: "required_maps_completed", mapIds: ["map.a", "map.b"] } }] };
  if (name === "maps") return { items: [{ mapId: "map.a", mapName: "地图甲", defaultGameplayRevisionId: "rev.a" }, { mapId: "map.b", mapName: "地图乙", defaultGameplayRevisionId: "rev.b" }] };
  if (name === "mapChallenges") return { items: [{ challengeId: "mc-1", mapId: "map.a", gameplayRevisionId: "rev.a", titleKey: "PIONEER_A", name: "地图甲开拓者", status: "active" }] };
  throw new Error(`Unexpected catalog request: ${name}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player, status: ref("authenticated"), refresh: vi.fn(async () => player.value) }));
mockNuxtImport("usePlayerTitles", () => () => ({ items: ownedTitles, allTitles, refresh: refreshTitles, replaceEquipped }));
mockNuxtImport("usePlayerChallengeProgress", () => () => ({ items: challengeProgress, refresh: refreshChallengeProgress }));
mockNuxtImport("usePublicCatalog", () => (name: string) => publicCatalog(name));

describe("/me/achievements", () => {
  it("shows the player's achievements and links each map to its own detail route", async () => {
    const wrapper = await mountSuspended(MyAchievementsPage, { route: "/me/achievements" });
    await flushPromises();
    expect(wrapper.text()).toContain("我的成就");
    expect(wrapper.text()).toContain("地图成就");
    expect(wrapper.find('a[href="/me/achievements/maps/map.a"]').exists()).toBe(true);
    expect(refreshTitles).toHaveBeenCalled();
  });

  it("renders the signed-in player's achievement overview and historical titles", async () => {
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    allTitles.value = false;
    ownedTitles.value = [{ grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2 }, { grantId: "grant-2", titleKey: "OLD", label: "历史称号", icon: "scroll", category: "旧记录", condition: "旧条件", scope: "global", grantedAt: 1 }];
    challengeProgress.value = [{ challengeId: "title-1", titleKey: "TEST", titleName: "测试称号", icon: "trophy", status: "active", progressRule: { type: "required_maps_completed", mapIds: ["map.a", "map.b"] }, maps: [{ mapId: "map.a", completed: true }, { mapId: "map.b", completed: false }], completedMaps: 1, satisfied: false }];
    const wrapper = await mountSuspended(MyAchievementsPage, { route: "/me/achievements" });
    await flushPromises();
    expect(wrapper.text()).toContain("我的成就");
    expect(wrapper.text()).toContain("已获得 1 / 1");
    expect(wrapper.text()).toContain("最近获得");
    expect(wrapper.findAll('[role="img"][aria-label="已获得"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("历史称号");
    expect(wrapper.text()).toContain("已完成 1 / 2");
    expect(refreshTitles).toHaveBeenCalled();
    expect(refreshChallengeProgress).toHaveBeenCalled();
  });

  it("shows an error when the personal achievement data cannot be loaded", async () => {
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    refreshTitles.mockRejectedValueOnce(new Error("unavailable"));
    const wrapper = await mountSuspended(MyAchievementsPage, { route: "/me/achievements" });
    await flushPromises();
    expect(wrapper.text()).toContain("无法读取成就");
  });

  it("shows recovery guidance when a normal player has migrated titles but no equipped selection", async () => {
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    allTitles.value = false;
    ownedTitles.value = Array.from({ length: 11 }, (_, index) => ({ grantId: `grant-${index}`, titleKey: `TEST-${index}`, label: `称号 ${index}`, icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: index, equipped: false }));
    challengeProgress.value = [];
    const wrapper = await mountSuspended(MyAchievementsPage, { route: "/me/achievements" });
    await flushPromises();
    expect(wrapper.text()).toContain("需要选择佩戴称号");
  });

  it("unequips only the remaining equipped titles", async () => {
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    ownedTitles.value = [{ grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2, equipped: true }, { grantId: "grant-2", titleKey: "OLD", label: "历史称号", icon: "scroll", category: "旧记录", condition: "旧条件", scope: "global", grantedAt: 1, equipped: false }];
    challengeProgress.value = [];
    const wrapper = await mountSuspended(MyAchievementsPage, { route: "/me/achievements" });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "取消佩戴")!.trigger("click");
    await flushPromises();
    expect(replaceEquipped).toHaveBeenLastCalledWith([]);
  });
});
