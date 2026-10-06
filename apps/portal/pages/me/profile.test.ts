import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ProfilePage from "./profile.vue";
import type { OwnedTitle } from "~/types/title";
import type { CurrentPlayerMasteryResponse, PlayerActivityDay, PortalMap } from "~/composables/usePortalApi";
import type { MapProgressChallenge } from "~/utils/map-progress";

type Player = { player: { playerId: string; playerName: string; isAdmin: boolean }; recentSubmissions: never[] };

const mapOne = { mapId: "map.one", mapName: "地图一", defaultGameplayRevisionId: "rev.one" };
const mapTwo = { mapId: "map.two", mapName: "地图二", defaultGameplayRevisionId: "rev.two" };
const challengeOneP: MapProgressChallenge = { challengeId: "c.one.p", mapId: "map.one", gameplayRevisionId: "rev.one", titleKey: "ONE_PIONEER", name: "开拓者", status: "active" };
const challengeOneC: MapProgressChallenge = { challengeId: "c.one.c", mapId: "map.one", gameplayRevisionId: "rev.one", titleKey: "ONE_CONQUEROR", name: "征服者", status: "active" };

const title = (overrides: Partial<OwnedTitle>): OwnedTitle => ({
  grantId: "grant-1",
  titleKey: "TITLE",
  label: "称号",
  icon: "trophy",
  category: "测试系列",
  condition: "完成挑战",
  scope: "global",
  grantedAt: 1_700_000_000_000,
  ...overrides,
});

const run = (overrides: Partial<CurrentPlayerMasteryResponse["runs"][number]> = {}): CurrentPlayerMasteryResponse["runs"][number] => ({
  runId: "run-1",
  mapId: "map.one",
  gameplayRevisionId: "rev.one",
  gameplayRevisionLifecycle: "default",
  mapVariant: null,
  difficulty: "困难",
  completionDurationSeconds: 500,
  deaths: 0,
  skips: 0,
  awardedXp: 300,
  acceptedAt: 1_750_000_000_000,
  status: "active",
  ...overrides,
});

const player = ref<Player | null>({ player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] });
const titles = ref<OwnedTitle[]>([]);
const status = ref<"unknown" | "loading" | "authenticated" | "anonymous">("authenticated");
const activityDays = ref<PlayerActivityDay[]>([]);
const activityLoading = ref(false);
const activityReady = ref(false);
const activityError = ref("");
const catalog = ref<{ maps: PortalMap[]; challenges: MapProgressChallenge[] }>({ maps: [], challenges: [] });
const catalogError = ref<Error | null>(null);
const masteryRuns = ref<CurrentPlayerMasteryResponse["runs"]>([]);
const masteryProfiles = ref<CurrentPlayerMasteryResponse["profiles"]>([]);
const masteryFails = ref(false);

const refreshPlayer = vi.fn(async () => player.value);
const refreshTitles = vi.fn(async () => titles.value);
const refreshActivity = vi.fn(async () => {
  activityReady.value = true;
  return { contractVersion: "1" as const, days: activityDays.value };
});
const refreshCatalog = vi.fn(async () => catalog.value);
const portalApi = vi.fn(async (path: string) => {
  if (path === "/v1/me/mastery?page=1&pageSize=10") {
    if (masteryFails.value) throw new Error("mastery unavailable");
    return { contractVersion: "1" as const, profiles: masteryProfiles.value, runs: masteryRuns.value, page: 1, pageSize: 10, total: masteryRuns.value.length, hasMore: false };
  }
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player, status, refresh: refreshPlayer }));
mockNuxtImport("usePlayerTitles", () => () => ({ items: titles, refresh: refreshTitles }));
mockNuxtImport("usePlayerActivity", () => () => ({ days: activityDays, loading: activityLoading, ready: activityReady, error: activityError, refresh: refreshActivity }));
mockNuxtImport("usePortalApi", () => () => portalApi);
mockNuxtImport("useAsyncData", () => () => ({ data: catalog, error: catalogError, refresh: refreshCatalog }));

async function mountPage(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(ProfilePage, {
    global: {
      stubs: {
        PageSectionHeader: { props: ["title"], template: "<header><h2>{{ title }}</h2><slot name=\"actions\" /></header>" },
        UButton: {
          props: ["to", "label", "loading"],
          emits: ["click"],
          template: '<a v-if="to" :href="to">{{ label }}</a><button v-else type="button" :disabled="loading" @click="$emit(\'click\')">{{ label }}</button>',
        },
        UAlert: {
          props: ["title", "description"],
          template: "<div role=\"alert\"><strong>{{ title }}</strong><p>{{ description }}</p><slot name=\"actions\" /></div>",
        },
        UEmpty: { props: ["title"], template: "<div>{{ title }}</div>" },
        USkeleton: { template: "<div class=\"skeleton\" />" },
        UIcon: { props: ["name"], template: "<i :data-icon=\"name\" />" },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

const stat = (wrapper: VueWrapper, label: string) => wrapper.findAll(".stat-sheet__item").find((item) => item.get("dt").text() === label)!.get("dd").text().replace(/\s+/g, " ");
const openUntouched = async (wrapper: VueWrapper) => {
  await wrapper.findAll("button").find((button) => button.text().includes("没有记录"))!.trigger("click");
  await flushPromises();
};

function reset(overrides?: { runs?: CurrentPlayerMasteryResponse["runs"]; profiles?: CurrentPlayerMasteryResponse["profiles"] }) {
  player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
  titles.value = [];
  status.value = "authenticated";
  activityDays.value = [];
  activityLoading.value = false;
  activityReady.value = false;
  activityError.value = "";
  catalog.value = { maps: [mapOne, mapTwo], challenges: [challengeOneP, challengeOneC] };
  catalogError.value = null;
  masteryRuns.value = overrides?.runs ?? [];
  masteryProfiles.value = overrides?.profiles ?? [];
  masteryFails.value = false;
  vi.clearAllMocks();
  refreshPlayer.mockImplementation(async () => player.value);
  refreshTitles.mockImplementation(async () => titles.value);
}

describe("me profile page", () => {
  it("renders the hero with identity, equipped titles, and progression summary", async () => {
    reset();
    titles.value = [
      title({ grantId: "g1", label: "极限操作", equipped: true }),
      title({ grantId: "g2", label: "地图一 开拓者", scope: "map", mapId: "map.one", gameplayRevisionId: "rev.one", mapName: "地图一", titleKey: "ONE_PIONEER" }),
      title({ grantId: "g3", label: "旧版本称号", scope: "map", mapId: "map.one", gameplayRevisionId: "rev.one-old", mapName: "地图一", titleKey: "ONE_PIONEER" }),
    ];

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("Player#1");
    expect(wrapper.get(".profile-hero__titles").text()).toContain("极限操作");
    expect(stat(wrapper, "称号")).toBe("3个");
    expect(stat(wrapper, "地图成就")).toBe("1/ 2");
  });

  it("groups earned titles into series with the map series first", async () => {
    reset();
    titles.value = [
      title({ grantId: "g-old", label: "最早称号", grantedAt: 1_600_000_000_000 }),
      title({ grantId: "g-new", label: "最新称号", grantedAt: 1_750_000_000_000 }),
      title({ grantId: "g-map", label: "地图一 征服者", scope: "map", mapId: "map.one", gameplayRevisionId: "rev.one", mapName: "地图一", titleKey: "ONE_CONQUEROR", slot: "conqueror", grantedAt: 1_720_000_000_000 }),
      title({ grantId: "g-pio", label: "地图一 开拓者", scope: "map", mapId: "map.one", gameplayRevisionId: "rev.one", mapName: "地图一", titleKey: "ONE_PIONEER", slot: "pioneer", grantedAt: 1_730_000_000_000 }),
    ];

    const wrapper = await mountPage();
    const groups = wrapper.findAll(".title-shelf__series");
    expect(groups.map((group) => group.get("h3").text())).toEqual(["地图称号", "测试系列"]);
    expect(groups[0]!.text()).toContain("征服者 1 · 开拓者 1");
    expect(groups[0]!.findAll(".title-badge").map((item) => item.attributes("aria-label"))).toEqual(["地图一 征服者，查看详情", "地图一 开拓者，查看详情"]);
    expect(groups[1]!.findAll(".title-badge").map((item) => item.attributes("aria-label"))).toEqual(["最新称号，查看详情", "最早称号，查看详情"]);
    expect(wrapper.findAll('a[href="/achievements"]').map((link) => link.text())).toContain("查看全部成就");
  });

  it("opens a title in a detail dialog with its condition and date", async () => {
    reset();
    titles.value = [title({ grantId: "g1", label: "极限操作", condition: "无伤通关一次", equipped: true })];

    const wrapper = await mountPage();
    await wrapper.get(".profile-hero__titles .title-badge").trigger("click");
    await flushPromises();
    const dialog = document.body.textContent ?? "";
    expect(dialog).toContain("无伤通关一次");
    expect(dialog).toContain("获得时间");
    expect(dialog).toContain("已佩戴");
  });

  it("collapses a long series until it is expanded", async () => {
    reset();
    titles.value = Array.from({ length: 10 }, (_, index) => title({ grantId: `g${index}`, label: `称号${index}`, grantedAt: 1_700_000_000_000 + index }));

    const wrapper = await mountPage();
    expect(wrapper.findAll(".title-shelf__tiles .title-badge")).toHaveLength(8);
    await wrapper.findAll("button").find((button) => button.text().includes("展开全部 10 个"))!.trigger("click");
    expect(wrapper.findAll(".title-shelf__tiles .title-badge")).toHaveLength(10);
  });

  it("shows the best map records by XP from the current revision only", async () => {
    const base = { gameplayRevisionId: "rev.one", difficultyStats: [{ difficulty: "困难" as const, verifiedRunCount: 2, fastestCompletionSeconds: 3_845 }], lowestDeaths: 3, fewestSkips: 0, highestSingleRunXp: 300, highestCompletedDifficulty: "困难" as const, recentRuns: [] };
    reset({
      profiles: [
        { ...base, mapId: "map.one", gameplayRevisionLifecycle: "default", totalXp: 900, verifiedRunCount: 4 },
        { ...base, mapId: "map.two", gameplayRevisionId: "rev.two", gameplayRevisionLifecycle: "historical", totalXp: 5_000, verifiedRunCount: 9 },
      ],
    });

    const wrapper = await mountPage();
    const records = wrapper.findAll(".map-record");
    expect(records).toHaveLength(1);
    expect(records[0]!.text()).toContain("地图一");
    expect(records[0]!.text()).toContain("1:04:05");
    expect(records[0]!.text()).toContain("900");
    expect(stat(wrapper, "精通 XP")).toBe("900");
  });

  it("shows honest empty states and keeps zero-progress maps visible", async () => {
    reset();

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("暂无称号");
    expect(wrapper.text()).toContain("过去一年暂无通关记录");
    expect(wrapper.find(".map-progress-list").exists()).toBe(false);
    await openUntouched(wrapper);
    const overview = wrapper.get(".map-progress-list");
    expect(overview.findAll("h3").map((heading) => heading.text())).toEqual(["地图一", "地图二"]);
    expect(overview.text()).toContain("已获得 0 / 2");
    expect(overview.text()).toContain("暂无地图成就");
    expect(wrapper.text()).toContain("暂无通关记录");
  });

  it("keeps map challenge completion distinct from repeatable mastery facts", async () => {
    reset({
      profiles: [{ mapId: "map.one", gameplayRevisionId: "rev.one", gameplayRevisionLifecycle: "default", totalXp: 900, verifiedRunCount: 4, difficultyStats: [], lowestDeaths: 0, fewestSkips: 0, highestSingleRunXp: 300, highestCompletedDifficulty: "困难", recentRuns: [run()] }],
      runs: [run()],
    });
    titles.value = [title({ grantId: "g1", label: "地图一 开拓者", scope: "map", mapId: "map.one", gameplayRevisionId: "rev.one", mapName: "地图一", titleKey: "ONE_PIONEER" })];

    const wrapper = await mountPage();
    const overview = wrapper.get(".map-progress-list");
    expect(overview.text()).toContain("已获得 1 / 2");
    expect(overview.text()).toContain("900 XP");
    expect(overview.text()).toContain("4 次");
    expect(overview.findAll(".map-target-list li.earned")).toHaveLength(1);
    const recentRun = wrapper.get(".recent-run");
    expect(recentRun.text()).toContain("地图一 · 困难");
    expect(recentRun.text()).toContain("300 XP");
    expect(recentRun.attributes("href")).toBe("/maps?mapId=map.one");
  });

  it("limits 最近通关 to active runs on the current default revision", async () => {
    reset({
      runs: [
        run({ runId: "run-current" }),
        run({ runId: "run-invalidated", status: "invalidated", awardedXp: 999 }),
        run({ runId: "run-selectable", gameplayRevisionId: "rev.one-old", gameplayRevisionLifecycle: "selectable", awardedXp: 999 }),
        run({ runId: "run-historical", gameplayRevisionId: "rev.one-ancient", gameplayRevisionLifecycle: "historical", awardedXp: 999 }),
      ],
    });

    const wrapper = await mountPage();
    const runs = wrapper.findAll(".recent-run");
    expect(runs).toHaveLength(1);
    expect(runs[0]!.text()).toContain("地图一 · 困难");
    expect(runs[0]!.text()).toContain("300 XP");
    expect(wrapper.text()).not.toContain("999 XP");
  });

  it("does not leak unearned hidden goals or count off-revision grants", async () => {
    reset();
    // A hidden challenge is simply absent from the public catalog; an owned
    // grant from a non-default revision must not count toward current progress.
    titles.value = [title({ grantId: "g-old", label: "旧称号", scope: "map", mapId: "map.one", gameplayRevisionId: "rev.old", mapName: "地图一", titleKey: "ONE_PIONEER" })];

    const wrapper = await mountPage();
    await openUntouched(wrapper);
    const overview = wrapper.get(".map-progress-list");
    expect(overview.text()).toContain("已获得 0 / 2");
    expect(overview.text()).not.toContain("隐藏");
    expect(stat(wrapper, "地图成就")).toBe("0/ 2");
  });

  it("keeps other sections usable when titles fail and supports retry", async () => {
    reset({ runs: [run()] });
    refreshTitles.mockRejectedValueOnce(new Error("titles unavailable"));

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("无法读取称号");
    expect(wrapper.text()).toContain("地图一 · 困难");
    await openUntouched(wrapper);
    expect(wrapper.get(".map-progress-list").text()).toContain("称号进度暂不可用");
    // 称号数据不可用时，hero 不得用空/过期列表伪造进度统计。
    expect(stat(wrapper, "称号")).toBe("—");
    expect(stat(wrapper, "地图成就")).toBe("—");

    titles.value = [title({ grantId: "g1", label: "恢复的称号" })];
    refreshTitles.mockResolvedValueOnce(titles.value);
    await wrapper.findAll("button").find((button) => button.text() === "重试")!.trigger("click");
    await flushPromises();
    expect(wrapper.get(".title-shelf").text()).toContain("测试系列");
    expect(wrapper.get(".title-badge").attributes("aria-label")).toBe("恢复的称号，查看详情");
  });

  it("surfaces activity and mastery failures without falsifying map progress", async () => {
    reset();
    masteryFails.value = true;
    refreshActivity.mockImplementationOnce(async () => {
      activityError.value = "无法读取通关记录，请稍后重试。";
      return null;
    });

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("无法读取通关记录");
    await openUntouched(wrapper);
    const overview = wrapper.get(".map-progress-list");
    expect(overview.text()).toContain("已获得 0 / 2");
    expect(overview.text()).not.toContain("暂无精通记录");
    expect(wrapper.text()).toContain("地图一");
  });

  it("settles loading and shows a full-page error with retry when the player cannot load", async () => {
    reset();
    player.value = null;
    status.value = "unknown";
    refreshPlayer.mockRejectedValueOnce(new Error("player unavailable"));

    const wrapper = await mountPage();
    expect(wrapper.find('[role="status"][aria-label="读取中…"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("无法读取玩家信息");

    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    status.value = "authenticated";
    await wrapper.findAll("button").find((button) => button.text() === "重试")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Player#1");
  });

  it("distinguishes a missing session from a read failure", async () => {
    reset();
    player.value = null;
    status.value = "anonymous";
    refreshPlayer.mockResolvedValueOnce(null);

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("需要登录");
    expect(wrapper.text()).not.toContain("无法读取玩家信息");
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true);
  });
});
