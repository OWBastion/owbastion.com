import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import AchievementsPage from "./achievements.vue";

const currentPlayer = ref<{ player: { playerId: string; playerName: string; isAdmin: boolean }; recentSubmissions: never[] } | null>(null);
const ownedTitles = ref<any[]>([]);
const allTitles = ref(false);
const challengeProgress = ref<any[]>([]);
const refreshPlayer = vi.fn(async () => currentPlayer.value);
const refreshTitles = vi.fn(async () => ownedTitles.value);
const refreshChallengeProgress = vi.fn(async () => challengeProgress.value);
const replaceEquipped = vi.fn(async (grantIds: string[]) => ({ grantIds }));
const publicCatalogFetch = vi.fn(async (name: string) => {
  if (name === "achievements") return { items: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: null, category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual", progressRule: { type: "required_maps_completed", mapIds: ["map.a", "map.b"] } }] };
  if (name === "maps" || name === "mapChallenges") return { items: [] };
  throw new Error(`Unexpected catalog request: ${name}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player: currentPlayer, refresh: refreshPlayer }));
mockNuxtImport("usePlayerTitles", () => () => ({ items: ownedTitles, allTitles, refresh: refreshTitles, replaceEquipped }));
mockNuxtImport("usePlayerChallengeProgress", () => () => ({ items: challengeProgress, refresh: refreshChallengeProgress }));
mockNuxtImport("usePublicCatalog", () => (name: string) => publicCatalogFetch(name));

describe("achievements page", () => {
  it("renders the public catalog for signed-out visitors", async () => {
    currentPlayer.value = null;
    ownedTitles.value = [];
    allTitles.value = false;
    const wrapper = await mountSuspended(AchievementsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("测试称号");
    expect(wrapper.text()).not.toContain("已获得");
    expect(refreshTitles).not.toHaveBeenCalled();
  });

  it("renders the same public catalog for a signed-in player without loading personal data", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    ownedTitles.value = [{ grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2 }];
    refreshTitles.mockClear();
    refreshChallengeProgress.mockClear();
    const wrapper = await mountSuspended(AchievementsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("测试称号");
    expect(wrapper.text()).not.toContain("我的成就");
    expect(wrapper.text()).not.toContain("已获得");
    expect(refreshTitles).not.toHaveBeenCalled();
    expect(refreshChallengeProgress).not.toHaveBeenCalled();
  });
});
