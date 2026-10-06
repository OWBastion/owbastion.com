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
    expect(wrapper.get(".profile-badges").text()).toContain("极限操作");
    expect(wrapper.text()).toContain("称号 3 个");
    expect(wrapper.text()).toContain("地图成就 1 / 2");
  });

  it("renders the earned title wall with context and date", async () => {
    reset();
    titles.value = [
      title({ grantId: "g-old", label: "最早称号", grantedAt: 1_600_000_000_000 }),
      title({ grantId: "g-new", label: "最新称号", grantedAt: 1_750_000_000_000 }),
      title({ grantId: "g-map", label: "地图一 征服者", scope: "map", mapId: "map.one", gameplayRevisionId: "rev.one", mapName: "地图一", titleKey: "ONE_CONQUEROR", grantedAt: 1_720_000_000_000 }),
    ];

    const wrapper = await mountPage();
    const wall = wrapper.get(".title-wall");
    expect(wall.findAll(".title-name strong").map((item) => item.text())).toEqual(["最新称号", "地图一 征服者", "最早称号"]);
    expect(wall.text()).toContain("地图一");
    expect(wall.text()).toContain("测试系列");
    expect(wrapper.get('a[href="/achievements"]').text()).toContain("查看全部成就");
  });

  it("shows honest empty states and keeps zero-progress maps visible", async () => {
    reset();

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("暂无称号");
    expect(wrapper.text()).toContain("过去一年暂无通关记录");
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
    const overview = wrapper.get(".map-progress-list");
    expect(overview.text()).toContain("已获得 0 / 2");
    expect(overview.text()).not.toContain("隐藏");
    expect(wrapper.text()).toContain("地图成就 0 / 2");
  });

  it("keeps other sections usable when titles fail and supports retry", async () => {
    reset({ runs: [run()] });
    refreshTitles.mockRejectedValueOnce(new Error("titles unavailable"));

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("无法读取称号");
    expect(wrapper.text()).toContain("地图一 · 困难");
    expect(wrapper.get(".map-progress-list").text()).toContain("称号进度暂不可用");
    // 称号数据不可用时，hero 不得用空/过期列表伪造进度统计。
    const hero = wrapper.get(".profile-hero");
    expect(hero.text()).not.toContain("地图成就");
    expect(hero.text()).not.toContain("称号 ");

    titles.value = [title({ grantId: "g1", label: "恢复的称号" })];
    refreshTitles.mockResolvedValueOnce(titles.value);
    await wrapper.findAll("button").find((button) => button.text() === "重试")!.trigger("click");
    await flushPromises();
    expect(wrapper.get(".title-wall").text()).toContain("恢复的称号");
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
