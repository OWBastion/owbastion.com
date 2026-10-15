import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { clearNuxtData } from "#imports";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeaderboardPage from "./leaderboard.vue";

const currentPlayer = ref<{ player: { playerId: string; playerName: string; isAdmin: boolean }; recentSubmissions: never[] } | null>(null);
const refreshPlayer = vi.fn(async () => currentPlayer.value);

const masteryItems = [
  { rank: 1, score: 1200, reachedAt: 1_700_000_000_000, player: { playerKey: "key-alpha", displayName: "霜狐", equippedTitle: { titleKey: "t1", label: "地狱行者", icon: "award" } }, runCount: 5, topDifficulty: "传奇" },
  { rank: 2, score: 1000, reachedAt: 1_700_000_100_000, player: { playerKey: "key-beta", displayName: "烈刃", equippedTitle: null }, runCount: 4, topDifficulty: "专家" },
  { rank: 3, score: 900, reachedAt: 1_700_000_200_000, player: { playerKey: "key-gamma", displayName: "夜枭", equippedTitle: null }, runCount: 3, topDifficulty: "困难" },
  { rank: 4, score: 800, reachedAt: 1_700_000_300_000, player: null, boards: { mastery: { rank: 4, score: 800 }, achievement: null }, runCount: 2, topDifficulty: "简单" },
];
const achievementItems = [
  { rank: 1, score: 8, reachedAt: 1_700_000_000_000, player: { playerKey: "key-alpha", displayName: "霜狐", equippedTitle: null }, masteryXp: 1200, latestTitle: { titleKey: "t1", label: "地狱行者", icon: "award" } },
  { rank: 2, score: 8, reachedAt: 1_700_000_500_000, player: null, boards: { mastery: null, achievement: { rank: 2, score: 8 } }, masteryXp: 640, latestTitle: null },
];
const boardPayload = (board: string, items: unknown[], extra: Record<string, unknown> = {}) => ({
  contractVersion: "1" as const,
  board,
  ruleVersion: "leaderboard.v1",
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  hasMore: false,
  ...extra,
});
const summaryPayload = {
  contractVersion: "1" as const,
  publicProfile: true,
  player: { displayName: "霜狐", equippedTitle: { titleKey: "t1", label: "地狱行者", icon: "award" } },
  boards: { mastery: { rank: 1, score: 1200 }, achievement: { rank: 1, score: 8 } },
  perMapXp: [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0713.1", xp: 1200, runCount: 5 }],
  titles: { map: [], general: [{ titleKey: "t1", label: "地狱行者", icon: "award" }] },
};

const defaultPortalApi = async (path: string) => {
  const url = new URL(`https://portal.test${path}`);
  if (url.pathname === "/v1/public/leaderboard") {
    const board = url.searchParams.get("board");
    const mapId = url.searchParams.get("mapId");
    if (board === "achievement") return boardPayload("achievement", achievementItems);
    return boardPayload("mastery", masteryItems, mapId ? { mapId, mapGameVersion: "26.0713.1" } : {});
  }
  if (url.pathname.startsWith("/v1/public/leaderboard/players/")) return summaryPayload;
  if (url.pathname === "/v1/me/leaderboard") {
    return { contractVersion: "1" as const, board: url.searchParams.get("board") ?? "mastery", ruleVersion: "leaderboard.v1", rank: 2, score: 1000, reachedAt: 1_700_000_100_000, gapToNextRank: 200 };
  }
  throw new Error(`Unexpected request: ${path}`);
};
const portalApi = vi.fn(defaultPortalApi);
const publicCatalogFetch = vi.fn(async (name: string) => {
  if (name === "maps") return { items: [{ mapId: "map.samoa", mapName: "萨摩亚" }, { mapId: "map.kingsrow", mapName: "国王大道" }] };
  throw new Error(`Unexpected catalog request: ${name}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player: currentPlayer, refresh: refreshPlayer }));
mockNuxtImport("usePortalApi", () => () => portalApi);
mockNuxtImport("usePublicCatalog", () => (name: string) => publicCatalogFetch(name));

const SlideoverStub = {
  props: ["open", "title", "ui"],
  template: '<section v-if="open" role="dialog" :aria-label="title"><slot name="body" /></section>',
};
const mountPage = () => mountSuspended(LeaderboardPage, { global: { stubs: { USlideover: SlideoverStub } } });

beforeEach(() => {
  currentPlayer.value = null;
  clearNuxtData();
  portalApi.mockImplementation(defaultPortalApi);
  portalApi.mockClear();
  refreshPlayer.mockClear();
});

describe("leaderboard page", () => {
  it("renders the mastery board with podium, table and explainer card", async () => {
    const wrapper = await mountPage();
    expect(wrapper.get("h1").text()).toBe("排行榜");
    const segButtons = wrapper.get(".seg").findAll("button");
    expect(segButtons.map((button) => button.text())).toEqual(["地图精通", "成就"]);
    expect(segButtons[0]!.attributes("aria-pressed")).toBe("true");
    expect(wrapper.get(".chips").findAll("button").map((button) => button.text())).toEqual(["全部地图", "萨摩亚", "国王大道"]);
    expect(wrapper.text()).toContain("所有地图、所有版本获得的精通 XP 总和");

    const pods = wrapper.findAll(".pod");
    expect(pods).toHaveLength(3);
    expect(pods[0]!.classes()).toContain("p1");
    expect(pods[0]!.text()).toContain("霜狐");
    expect(pods[0]!.text()).toContain("1,200");

    const rows = wrapper.findAll("tr.board-row");
    expect(rows).toHaveLength(4);
    expect(rows[3]!.text()).toContain("匿名玩家");
    expect(rows[3]!.text()).not.toContain("key-");
    expect(wrapper.get(".side").text()).toContain("精通 XP 怎么算");
    expect(wrapper.get(".mine").text()).toContain("登录");
  });

  it("switches to the achievement board with achievement columns", async () => {
    const wrapper = await mountPage();
    await wrapper.get(".seg").findAll("button")[1]!.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith(expect.stringContaining("board=achievement"));
    expect(wrapper.get(".section-title").text()).toBe("成就排行榜");
    const rows = wrapper.findAll("tr.board-row");
    expect(rows[1]!.text()).toContain("匿名玩家");
    expect(wrapper.get(".side").text()).toContain("成就排行怎么算");
    expect(wrapper.find(".chips").exists()).toBe(false);
  });

  it("scopes the mastery board to a map chip with the current-revision note", async () => {
    const wrapper = await mountPage();
    await wrapper.get(".chips").findAll("button")[1]!.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith(expect.stringContaining("mapId=map.samoa"));
    expect(wrapper.get(".section-title").text()).toBe("萨摩亚 精通排行榜");
    expect(wrapper.text()).toContain("当前版本 26.0713.1，地图更新后重新累计");
  });

  it("shows the signed-in player's own rank and marks their row", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "烈刃", isAdmin: false }, recentSubmissions: [] };
    const wrapper = await mountPage();
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith(expect.stringContaining("/v1/me/leaderboard"));
    expect(wrapper.get(".mine").text()).toContain("#2");
    expect(wrapper.get(".mine").text()).toContain("距上一名差 200 XP");
    const meRow = wrapper.find("tr.me");
    expect(meRow.exists()).toBe(true);
    expect(meRow.text()).toContain("你");
  });

  it("opens the player sheet: anonymous rows render inline, public rows fetch the summary", async () => {
    const wrapper = await mountPage();
    await flushPromises();
    portalApi.mockClear();
    const rows = wrapper.findAll("tr.board-row");
    await rows[3]!.trigger("click");
    const sheet = wrapper.get('[role="dialog"]');
    expect(sheet.text()).toContain("匿名玩家");
    expect(sheet.text()).toContain("这位玩家关闭了公开主页");
    expect(portalApi).not.toHaveBeenCalled();
    await rows[0]!.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith("/v1/public/leaderboard/players/key-alpha");
    expect(sheet.text()).toContain("萨摩亚");
    expect(sheet.text()).toContain("地狱行者");
  });

  it("paginates the table and only shows the podium on page 1", async () => {
    const paged = (pageIndex: number) =>
      Array.from({ length: 20 }, (_, index) => ({
        rank: (pageIndex - 1) * 20 + index + 1,
        score: 5000 - index,
        reachedAt: 1_700_000_000_000 + index,
        player: null,
      }));
    portalApi.mockImplementation(async (path) => {
      const url = new URL(`https://portal.test${path}`);
      if (url.pathname === "/v1/public/leaderboard") {
        const pageIndex = Number(url.searchParams.get("page") ?? "1");
        return boardPayload("mastery", paged(pageIndex), { page: pageIndex, total: 45, hasMore: pageIndex < 3 });
      }
      if (url.pathname === "/v1/me/leaderboard") return { contractVersion: "1" as const, board: "mastery", ruleVersion: "leaderboard.v1", rank: null, score: 0, reachedAt: null, gapToNextRank: null };
      throw new Error(`Unexpected request: ${path}`);
    });
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.get(".pager").text()).toContain("第 1–20 名，共 45 名");
    expect(wrapper.findAll(".pod")).toHaveLength(3);
    const pageTwo = wrapper.get(".pg").findAll("button").find((button) => button.text() === "2");
    await pageTwo!.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith(expect.stringContaining("page=2"));
    expect(wrapper.get(".pager").text()).toContain("第 21–40 名，共 45 名");
    expect(wrapper.findAll(".pod")).toHaveLength(0);
    expect(wrapper.findAll("tr.board-row")[0]!.text()).toContain("21");
  });

  it("renders the empty state when nobody is on the board", async () => {
    portalApi.mockImplementation(async (path) => {
      const url = new URL(`https://portal.test${path}`);
      if (url.pathname === "/v1/public/leaderboard") return boardPayload("mastery", [], { total: 0 });
      throw new Error(`Unexpected request: ${path}`);
    });
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("这里还没有人上榜");
    expect(wrapper.findAll(".pod")).toHaveLength(0);
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("shows the error state with retry", async () => {
    let calls = 0;
    portalApi.mockImplementation(async (path) => {
      const url = new URL(`https://portal.test${path}`);
      if (url.pathname === "/v1/public/leaderboard") {
        calls += 1;
        throw new Error("upstream timeout");
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("无法读取排行榜");
    const retry = wrapper.findAll("button").find((button) => button.text().includes("重试"));
    expect(retry).toBeTruthy();
    await retry!.trigger("click");
    await flushPromises();
    expect(calls).toBe(2);
  });

  it("jumps to the signed-in player's page only after the explicit action", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "烈刃", isAdmin: false }, recentSubmissions: [] };
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    portalApi.mockImplementation(async (path) => {
      const url = new URL(`https://portal.test${path}`);
      if (url.pathname === "/v1/me/leaderboard") {
        return { contractVersion: "1" as const, board: "mastery", ruleVersion: "leaderboard.v1", rank: 42, score: 10, reachedAt: 1_700_000_000_000, gapToNextRank: 5 };
      }
      if (url.pathname === "/v1/public/leaderboard") {
        const pageIndex = Number(url.searchParams.get("page") ?? "1");
        const items = Array.from({ length: 20 }, (_, index) => ({
          rank: (pageIndex - 1) * 20 + index + 1,
          score: 5000 - index,
          reachedAt: 1_700_000_000_000 + index,
          player: null,
        }));
        return boardPayload("mastery", items, { page: pageIndex, total: 50, hasMore: pageIndex < 3 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.get(".mine").text()).toContain("#42");
    expect(scrollSpy).not.toHaveBeenCalled();
    await wrapper.get(".mine .btn").trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith(expect.stringContaining("page=3"));
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(wrapper.find("tr.me").exists()).toBe(true);
  });
});
