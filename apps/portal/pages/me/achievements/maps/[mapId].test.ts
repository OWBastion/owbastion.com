import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import MapAchievementPage from "./[mapId].vue";

const route = reactive({ params: { mapId: "map.a" } as Record<string, string>, query: {} });
const player = ref<unknown>({ player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] });
const titles = ref<unknown[]>([{ grantId: "g1", titleKey: "PIONEER_A", label: "开拓者", icon: "trophy", category: "地图", condition: "x", scope: "map", mapId: "map.a", gameplayRevisionId: "rev.a", mapName: "地图甲", slot: "pioneer", grantedAt: 1 }]);
const profiles = ref<unknown[]>([{ mapId: "map.a", gameplayRevisionId: "rev.a", gameplayRevisionLifecycle: "default", totalXp: 120, verifiedRunCount: 2, lowestDeaths: 1, fewestSkips: 0, highestCompletedDifficulty: "困难", difficultyStats: [], recentRuns: [] }]);
const loadHistory = vi.fn(async () => null);
const publicCatalog = vi.fn(async (name: string) => {
  if (name === "maps") return { items: [{ mapId: "map.a", mapName: "地图甲", defaultGameplayRevisionId: "rev.a" }, { mapId: "map.b", mapName: "地图乙", defaultGameplayRevisionId: "rev.b" }] };
  if (name === "mapChallenges") return { items: [
    { challengeId: "mc-1", mapId: "map.a", gameplayRevisionId: "rev.a", titleKey: "PIONEER_A", name: "地图甲开拓者", status: "active" },
    { challengeId: "mc-2", mapId: "map.a", gameplayRevisionId: "rev.a", titleKey: "CONQUEROR_A", name: "地图甲征服者", status: "active" },
    { challengeId: "mc-3", mapId: "map.b", gameplayRevisionId: "rev.b", titleKey: "PIONEER_B", name: "地图乙开拓者", status: "active" },
  ] };
  throw new Error(`Unexpected catalog request: ${name}`);
});

mockNuxtImport("useRoute", () => () => route);
mockNuxtImport("useCurrentPlayer", () => () => ({ player, status: ref("authenticated"), refresh: vi.fn(async () => player.value) }));
mockNuxtImport("usePlayerTitles", () => () => ({ items: titles, refresh: vi.fn(async () => titles.value) }));
mockNuxtImport("usePlayerMastery", () => () => ({ profiles, overviewLoading: ref(false), overviewError: ref(""), refreshOverview: vi.fn(), history: ref(null), historyMapId: ref(null), historyLoading: ref(false), historyError: ref(""), loadHistory }));
mockNuxtImport("usePublicCatalog", () => (name: string) => publicCatalog(name));

describe("/me/achievements/maps/[mapId]", () => {
  it("shows only the requested map's achievements, earned state and mastery, and loads its run history", async () => {
    const wrapper = await mountSuspended(MapAchievementPage, { route: "/me/achievements/maps/map.a" });
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("地图甲");
    expect(wrapper.text()).toContain("已获得 1 / 2");
    expect(wrapper.text()).toContain("地图甲开拓者");
    expect(wrapper.text()).toContain("地图甲征服者");
    expect(wrapper.text()).not.toContain("地图乙");
    expect(wrapper.text()).toContain("120 XP");
    expect(loadHistory).toHaveBeenCalledWith({ mapId: "map.a" });
    expect(wrapper.find('a[href="/me/achievements"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/maps?mapId=map.a"]').exists()).toBe(true);
  });

  it("explains an unknown map instead of rendering an empty page", async () => {
    route.params.mapId = "map.missing";
    const wrapper = await mountSuspended(MapAchievementPage, { route: "/me/achievements/maps/map.missing" });
    await flushPromises();
    expect(wrapper.text()).toContain("没有找到这张地图");
    route.params.mapId = "map.a";
  });
});
