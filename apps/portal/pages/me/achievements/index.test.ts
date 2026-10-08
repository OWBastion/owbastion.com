import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import MyAchievementsPage from "./index.vue";

const player = ref<unknown>({ player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] });
const ownedTitles = ref<unknown[]>([]);
const refreshTitles = vi.fn(async () => ownedTitles.value);
const publicCatalog = vi.fn(async (name: string) => {
  if (name === "achievements") return { items: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", status: "active" }] };
  if (name === "maps") return { items: [{ mapId: "map.a", mapName: "地图甲", defaultGameplayRevisionId: "rev.a" }] };
  if (name === "mapChallenges") return { items: [{ challengeId: "mc-1", mapId: "map.a", gameplayRevisionId: "rev.a", titleKey: "PIONEER_A", name: "地图甲开拓者", status: "active" }] };
  throw new Error(`Unexpected catalog request: ${name}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player, status: ref("authenticated"), refresh: vi.fn(async () => player.value) }));
mockNuxtImport("usePlayerTitles", () => () => ({ items: ownedTitles, allTitles: ref(false), refresh: refreshTitles, replaceEquipped: vi.fn() }));
mockNuxtImport("usePlayerChallengeProgress", () => () => ({ items: ref([]), refresh: vi.fn(async () => []) }));
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
});
