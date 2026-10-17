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
  mapCount: 2,
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
  if (url.pathname === "/v1/public/seasons") return { contractVersion: "1" as const, items: [] };
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
    expect(wrapper.findAll(".seg")).toHaveLength(1);
    expect(wrapper.find(".season").exists()).toBe(false);
    expect(wrapper.get(".chips").findAll("button").map((button) => button.text())).toEqual(["全部地图", "萨摩亚", "国王大道"]);
    expect(wrapper.text()).toContain("所有地图、所有版本获得的精通 XP 总和");

    const pods = wrapper.findAll(".pod");
    expect(pods).toHaveLength(3);
    expect(pods[0]!.text()).toContain("霜狐");
    expect(pods[0]!.text()).toContain("1,200");

    const rows = wrapper.findAll("tr.board-row");
    expect(rows).toHaveLength(4);
    expect(rows[3]!.text()).toContain("匿名玩家");
    expect(rows[3]!.text()).not.toContain("key-");
    expect(wrapper.get(".side").text()).toContain("精通 XP 怎么算");
    const base = wrapper.get(".side .xp-base").text();
    expect(base).toContain("传奇");
    expect(base).toContain("地狱");
    expect(base).not.toContain("简单");
    const tags = wrapper.findAll(".side .xp-tag").map((tag) => tag.text());
    expect(tags).toContain("T0+20%");
    expect(tags).toContain("T5—");
    expect(tags).toContain("成就 +5%每个");
    expect(tags).toContain("每日首通 +10%");
    expect(wrapper.get(".mine").text()).toContain("登录");
  });

  it("scopes the mastery board to a Season and hides the scope on the achievement board", async () => {
    const day = 86_400_000;
    const season = { seasonId: "11111111-1111-4111-8111-111111111111", name: "第二赛季", startsAt: Date.now() - 10 * day, endsAt: Date.now() + 20 * day, phase: "running" as const };
    portalApi.mockImplementation(async (path: string) => new URL(`https://portal.test${path}`).pathname === "/v1/public/seasons"
      ? { contractVersion: "1" as const, items: [season] }
      : defaultPortalApi(path));
    const wrapper = await mountPage();
    expect(wrapper.find(".season").exists()).toBe(false);
    const scope = wrapper.findAll(".seg")[1]!;
    expect(scope.findAll("button").map((button) => button.text())).toEqual(["全部时间", "赛季"]);
    await scope.findAll("button")[1]!.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith(expect.stringContaining(`seasonId=${season.seasonId}`));
    expect(wrapper.get(".season").text()).toContain("第二赛季");
    expect(wrapper.get(".season").text()).toContain("进行中");
    expect(wrapper.get(".section-title").text()).toBe("第二赛季 · 地图精通排行榜");
    expect(wrapper.get(".side").text()).toContain("赛季怎么算");
    await wrapper.get(".seg").findAll("button")[1]!.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenLastCalledWith(expect.not.stringContaining("seasonId"));
    expect(wrapper.find(".season").exists()).toBe(false);
    expect(wrapper.findAll(".seg")).toHaveLength(1);
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

  it("groups map titles by map with a tier summary and collapses long lists", async () => {
    const mapIds = Array.from({ length: 7 }, (_, index) => `map.${index}`);
    const mapTitle = (mapId: string, slot: string | null, label: string) => ({ titleKey: `${mapId}.${label}`, label, icon: "award", mapId, mapName: `地图${mapId.slice(4)}`, slot });
    portalApi.mockImplementation(async (path) => {
      if (!path.startsWith("/v1/public/leaderboard/players/")) return defaultPortalApi(path);
      return {
        ...summaryPayload,
        mapCount: 40,
        perMapXp: mapIds.map((mapId, index) => ({ mapId, mapName: `地图${index}`, gameVersion: "26.0713.1", xp: 7000 - index * 1000, runCount: 1 })),
        titles: {
          map: [
            mapTitle("map.0", "pioneer", "开拓者 · 地图0"), mapTitle("map.0", "dominator", "主宰 · 地图0"), mapTitle("map.0", "conqueror", "征服者 · 地图0"),
            mapTitle("map.1", "conqueror", "征服者 · 地图1"), mapTitle("map.1", null, "老兵"),
            mapTitle("map.2", "pioneer", "开拓者 · 地图2"),
            mapTitle("map.classic", null, "老兵"),
          ],
          general: Array.from({ length: 12 }, (_, index) => ({ titleKey: `g${index}`, label: `成就${index}`, icon: "award" })),
        },
      };
    });
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper.findAll("tr.board-row")[0]!.trigger("click");
    await flushPromises();
    const sheet = wrapper.get('[role="dialog"]');
    expect(sheet.text()).toContain("地图 · 玩过 8 / 40 张");
    const summaryCells = sheet.findAll(".player-sheet-tiers > div").map((cell) => cell.text());
    expect(summaryCells).toEqual(["1主宰", "1征服者", "1开拓者"]);
    const rows = sheet.findAll(".player-sheet-map-row");
    expect(rows).toHaveLength(5);
    expect(rows[0]!.text()).toContain("地图0");
    expect(rows[0]!.findAll(".tier").map((badge) => badge.text())).toEqual(["主宰"]);
    expect(rows[1]!.findAll(".tier").map((badge) => badge.text())).toEqual(["征服者", "老兵"]);
    expect(rows[0]!.text()).toContain("7,000 XP");
    expect(sheet.text()).not.toContain("开拓者 · 地图0");
    await sheet.get(".more").trigger("click");
    const allRows = sheet.findAll(".player-sheet-map-row");
    expect(allRows).toHaveLength(8);
    // A map known only through a classic title shows the title and no XP.
    expect(allRows[7]!.text()).toContain("老兵");
    expect(allRows[7]!.text()).toContain("—");
    expect(sheet.text()).toContain("成就 · 12");
    expect(sheet.findAll(".player-sheet-titles .title-pill")).toHaveLength(10);
    const more = sheet.findAll(".more");
    expect(more.map((button) => button.text())).toEqual(["展开其余 2 个"]);
    await more[0]!.trigger("click");
    expect(sheet.findAll(".player-sheet-titles .title-pill")).toHaveLength(12);
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
