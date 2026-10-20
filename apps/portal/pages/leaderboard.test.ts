import { clearNuxtData } from "#app";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeaderboardPage from "./leaderboard.vue";

const hoisted = vi.hoisted(() => ({ api: vi.fn(), query: { value: {} as Record<string, string> } }));
const player = ref<{ playerId: string } | null>(null);
mockNuxtImport("usePortalApi", () => () => hoisted.api);
mockNuxtImport("usePublicCatalog", () => async () => ({ items: [{ mapId: "map-1", name: "Map" }] }));
mockNuxtImport("useRoute", () => () => ({ params: {}, query: hoisted.query.value }));
mockNuxtImport("useCurrentPlayer", () => () => ({ player, refresh: async () => player.value }));

const api = hoisted.api;
const entry = (rank: number) => ({ rank, score: 1000 - rank, reachedAt: 1, player: { displayName: `player-${rank}` } });
const board = (page: number, total = 45) => ({
  contractVersion: "1",
  board: "mastery",
  page,
  pageSize: 20,
  total,
  items: Array.from({ length: Math.max(0, Math.min(20, total - (page - 1) * 20)) }, (_, index) => entry((page - 1) * 20 + index + 1)),
});
const requested = (prefix: string) => api.mock.calls.map(([path]) => String(path)).filter((path) => path.startsWith(prefix)).map((path) => new URL(path, "http://x").searchParams);
const boardRequests = () => requested("/v1/public/leaderboard");
const click = async (wrapper: Awaited<ReturnType<typeof mountSuspended>>, text: RegExp) => {
  const target = wrapper.findAll("button, a").find((element) => text.test(element.text() || element.attributes("aria-label") || ""));
  expect(target, String(text)).toBeDefined();
  await target!.trigger("click");
  await flushPromises();
};

beforeEach(() => {
  clearNuxtData();
  api.mockReset();
  player.value = null;
  hoisted.query.value = {};
  api.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/public/seasons")) return { contractVersion: "1", items: [{ seasonId: "season-1", name: "S1" }] };
    if (path.startsWith("/v1/public/leaderboard")) return board(Number(new URL(path, "http://x").searchParams.get("page")));
    if (path.startsWith("/v1/me/leaderboard")) return { contractVersion: "1", rank: 45, score: 955, gapToNextRank: 3 };
    throw new Error(`unexpected ${path}`);
  });
});

describe("leaderboard", () => {
  it("reads the mastery board first and the achievement board when switched, without the mastery scopes", async () => {
    hoisted.query.value = { mapId: "map-1", seasonId: "season-1" };
    const wrapper = await mountSuspended(LeaderboardPage);
    await flushPromises();
    expect(boardRequests().at(-1)!.get("board")).toBe("mastery");
    expect(boardRequests().at(-1)!.get("mapId")).toBe("map-1");
    expect(boardRequests().at(-1)!.get("seasonId")).toBe("season-1");

    await click(wrapper, /成就/);
    const last = boardRequests().at(-1)!;
    expect(last.get("board")).toBe("achievement");
    expect(last.get("page")).toBe("1");
    expect(last.has("mapId")).toBe(false);
    expect(last.has("seasonId")).toBe(false);
  });

  it("does not ask for a personal rank when nobody is signed in", async () => {
    await mountSuspended(LeaderboardPage);
    await flushPromises();
    expect(requested("/v1/me/leaderboard")).toHaveLength(0);
  });

  it("opens the page that holds the signed-in player's own rank", async () => {
    player.value = { playerId: "p1" };
    const wrapper = await mountSuspended(LeaderboardPage);
    await flushPromises();

    await click(wrapper, /#45/);

    expect(boardRequests().at(-1)!.get("page")).toBe("3");
    expect(wrapper.text()).toContain("player-45");
  });

  it("recovers from a failed board read through retry", async () => {
    const ok = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, ...rest: unknown[]) => {
      if (path.startsWith("/v1/public/leaderboard")) throw Object.assign(new Error("down"), { statusCode: 503 });
      return ok(path, ...rest);
    });
    const wrapper = await mountSuspended(LeaderboardPage);
    await flushPromises();
    expect(wrapper.find("[role=alert]").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("player-1");

    api.mockImplementation(ok);
    await click(wrapper, /重试/);
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
    expect(wrapper.text()).toContain("player-1");
  });
});
