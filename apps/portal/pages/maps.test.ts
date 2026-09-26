import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapsPage from "./maps.vue";

const currentPlayer = ref<{ player: { playerId: string; playerName: string; bindingStatus: "bound"; isAdmin: boolean }; recentSubmissions: never[] } | null>(null);
const refreshPlayer = vi.fn(async () => currentPlayer.value);
const masteryResponse = (path: string) => {
  const query = new URL(`https://portal.test${path}`).searchParams;
  const mapId = query.get("mapId");
  const runs = [{ runId: "00000000-0000-4000-8000-000000000001", mapId: "map.samoa", gameplayRevisionId: "revision:map.samoa:initial", gameplayRevisionLifecycle: "default" as const, mapVariant: null, difficulty: "地狱" as const, completionDurationSeconds: 640, deaths: 1, skips: 0, awardedXp: 225, acceptedAt: 1_000, status: "active" as const }];
  return {
    contractVersion: "1" as const,
    profiles: [{ mapId: "map.samoa", gameplayRevisionId: "revision:map.samoa:initial", gameplayRevisionLifecycle: "default" as const, totalXp: 225, verifiedRunCount: 1, difficultyStats: [{ difficulty: "地狱" as const, verifiedRunCount: 1, fastestCompletionSeconds: 640 }], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 225, highestCompletedDifficulty: "地狱" as const, recentRuns: runs }],
    runs: mapId === "map.samoa" ? runs : [],
    page: Number(query.get("page") ?? 1),
    pageSize: Number(query.get("pageSize") ?? 1),
    total: mapId === "map.samoa" ? 1 : 0,
    hasMore: false,
  };
};

const defaultPortalApi = async (path: string) => {
  if (path === "/v1/maps") return { items: [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0713.1", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: "https://cdn.example.com/samoa-cover.png", backgroundUrl: "https://cdn.example.com/samoa-background.jpg" }] };
  if (path === "/v1/challenges?family=map") return { items: [{ challengeId: "map.samoa.hell", family: "map", gameplayRevisionId: "revision:map.samoa:initial", type: "map_completion", kind: "difficulty_completion", name: "地狱难度通关", mapId: "map.samoa", mapName: "萨摩亚", difficulty: "地狱", gameVersion: "26.0713.1", status: "active" }] };
  if (path.startsWith("/v1/me/mastery?")) return masteryResponse(path);
  if (path.startsWith("/v1/public/reviews/summaries?")) return { contractVersion: "1", targetType: "map", items: [{ targetType: "map", targetId: "map.samoa", averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true }] };
  throw new Error(`Unexpected request: ${path}`);
};
const portalApi = vi.fn(defaultPortalApi);
const publicCatalogFetch = vi.fn(async (name: string) => {
  if (name === "maps") return { items: (await defaultPortalApi("/v1/maps")).items };
  if (name === "mapChallenges") return { items: (await defaultPortalApi("/v1/challenges?family=map")).items };
  throw new Error(`Unexpected catalog request: ${name}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player: currentPlayer, refresh: refreshPlayer }));
mockNuxtImport("usePortalApi", () => () => portalApi);
mockNuxtImport("usePublicCatalog", () => (name: string) => publicCatalogFetch(name));

describe("maps page", () => {
  beforeEach(() => {
    clearNuxtData("public-map-directory");
    portalApi.mockReset();
    portalApi.mockImplementation(defaultPortalApi);
    publicCatalogFetch.mockReset();
    publicCatalogFetch.mockImplementation(async (name: string) => {
      if (name === "maps") return { items: (await defaultPortalApi("/v1/maps")).items };
      if (name === "mapChallenges") return { items: (await defaultPortalApi("/v1/challenges?family=map")).items };
      throw new Error(`Unexpected catalog request: ${name}`);
    });
    refreshPlayer.mockClear();
  });

  it("renders the public map directory for signed-out visitors", async () => {
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("登录后查看");
    expect(wrapper.text()).toContain("登录后可查看精通与评价。");
    expect(wrapper.get('button[aria-label="查看萨摩亚详情"] img').attributes("src")).toBe("https://cdn.example.com/samoa-cover.png");
    expect(publicCatalogFetch).toHaveBeenCalledWith("maps");
    expect(publicCatalogFetch).toHaveBeenCalledWith("mapChallenges");
    expect(portalApi).not.toHaveBeenCalledWith("/v1/me/mastery?page=1&pageSize=1");
  });

  it("does not show map details before a map is selected", async () => {
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    expect(wrapper.text()).not.toContain("地图概览");
  });

  it("does not fail when a legacy map response omits metadata", async () => {
    publicCatalogFetch.mockImplementationOnce(async (name: string) => {
      if (name === "maps") return { items: [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0713.1" }] };
      if (name === "mapChallenges") return { items: [] };
      throw new Error(`Unexpected catalog request: ${name}`);
    });
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).not.toContain("暂无机制");
  });

  it("opens map detail from a shared mapId query", async () => {
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage, { route: "/maps?mapId=map.samoa" });
    await flushPromises();
    expect(document.body.textContent).toContain("地图概览");
    expect(document.body.textContent).toContain("地狱难度通关");
    wrapper.unmount();
  });

  it("shows map details and mastery for the selected map", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] };
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    await wrapper.get('button[aria-label="查看萨摩亚详情"]').trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("精通记录");
    expect(document.body.textContent).toContain("225 XP");
    expect(document.body.textContent).toContain("通关记录");
    expect(document.body.textContent).toContain("地狱难度通关");
    expect(wrapper.text()).toContain("1 项");
    expect(wrapper.text()).not.toContain("挑战进度");
    expect(wrapper.text()).not.toContain("登录后可查看精通与评价。");
    expect(portalApi).toHaveBeenCalledWith("/v1/me/mastery?mapId=map.samoa&page=1&pageSize=10");
    wrapper.unmount();
  });

  it("shows the factual error state when either public catalog request fails", async () => {
    portalApi.mockImplementation(async (path: string) => {
      if (path.startsWith("/v1/public/reviews/summaries?")) return { contractVersion: "1", targetType: "map", items: [] };
      throw new Error(`Unexpected request: ${path}`);
    });
    publicCatalogFetch.mockImplementation(async (name: string) => {
      if (name === "maps") throw new Error("maps unavailable");
      if (name === "mapChallenges") return { items: [] };
      throw new Error(`Unexpected catalog request: ${name}`);
    });
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("无法读取地图");
  });
});
