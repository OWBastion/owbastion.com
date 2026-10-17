import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MapMasteryCard from "./MapMasteryCard.vue";
import type { PlayerMasteryMapProfile } from "~/composables/usePortalApi";

const profile: PlayerMasteryMapProfile = {
  mapId: "map.samoa",
  gameplayRevisionId: "revision:map.samoa:default",
  gameplayRevisionLifecycle: "default",
  totalXp: 900,
  verifiedRunCount: 4,
  lowestDeaths: 3,
  fewestSkips: null,
  highestSingleRunXp: 300,
  highestCompletedDifficulty: "困难",
  difficultyStats: [{ difficulty: "困难", verifiedRunCount: 2, fastestCompletionSeconds: 3_845 }],
  recentRuns: [],
};
const challenges = [
  { challengeId: "samoa.pioneer", mapId: "map.samoa", gameplayRevisionId: "r", titleKey: "A", name: "开拓者", status: "active" as const },
  { challengeId: "samoa.conqueror", mapId: "map.samoa", gameplayRevisionId: "r", titleKey: "B", name: "征服者", status: "sunsetting" as const },
];

describe("MapMasteryCard detail", () => {
  it("asks signed-out players to sign in", async () => {
    const wrapper = await mountSuspended(MapMasteryCard, { props: { variant: "detail", authenticated: false } });
    expect(wrapper.text()).toContain("登录后查看");
    expect(wrapper.find("dl").exists()).toBe(false);
  });

  it("shows a loading status while the profile loads", async () => {
    const wrapper = await mountSuspended(MapMasteryCard, { props: { variant: "detail", loading: true } });
    expect(wrapper.get('[role="status"]').attributes("aria-label")).toBe("读取精通记录…");
    expect(wrapper.find("dl").exists()).toBe(false);
  });

  it("shows the error with a retry action", async () => {
    const wrapper = await mountSuspended(MapMasteryCard, { props: { variant: "detail", error: "网络错误" } });
    expect(wrapper.text()).toContain("无法读取精通记录");
    expect(wrapper.text()).toContain("网络错误");
    await wrapper.findAll("button").find((button) => button.text() === "重试")!.trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("shows the empty state when there is no profile", async () => {
    const wrapper = await mountSuspended(MapMasteryCard, { props: { variant: "detail", profile: null } });
    expect(wrapper.text()).toContain("暂无精通记录");
  });

  it("shows stats, per-difficulty records and the slotted history", async () => {
    const wrapper = await mountSuspended(MapMasteryCard, { props: { variant: "detail", profile }, slots: { default: "<p>历史记录</p>" } });
    const text = wrapper.text();
    for (const expected of ["900 XP", "4 次", "困难", "3", "暂无记录", "300 XP", "2 次 · 最快 1:04:05", "历史记录"]) expect(text).toContain(expected);
  });
});

describe("MapMasteryCard record", () => {
  it("links to the map and shows difficulty and best stats", async () => {
    const wrapper = await mountSuspended(MapMasteryCard, { props: { variant: "record", mapName: "萨摩亚", profile, to: "/maps?mapId=map.samoa" } });
    expect(wrapper.get("a").attributes("href")).toBe("/maps?mapId=map.samoa");
    expect(wrapper.get("a").attributes("aria-label")).toBe("查看萨摩亚详情");
    expect(wrapper.text()).toContain("困难");
    expect(wrapper.text()).toContain("1:04:05");
    expect(wrapper.text()).toContain("900");
  });
});

describe("MapMasteryCard progress", () => {
  it("lists earned and unearned targets with text markers", async () => {
    const wrapper = await mountSuspended(MapMasteryCard, { props: { variant: "progress", mapName: "萨摩亚", to: "/me/achievements/maps/map.samoa", challenges, earnedChallenges: [challenges[0]!] } });
    expect(wrapper.get("a").attributes("href")).toBe("/me/achievements/maps/map.samoa");
    expect(wrapper.text()).toContain("已获得 1 / 2");
    expect(wrapper.text()).toContain("✓");
    expect(wrapper.text()).toContain("○");
    expect(wrapper.text()).toContain("即将结束");
  });

  it("marks a finished map complete and a map without challenges as having none", async () => {
    const done = await mountSuspended(MapMasteryCard, { props: { variant: "progress", mapName: "萨摩亚", challenges, earnedChallenges: challenges } });
    expect(done.text()).toContain("已完成");
    const none = await mountSuspended(MapMasteryCard, { props: { variant: "progress", mapName: "哈瓦那" } });
    expect(none.text()).toContain("暂无地图成就");
  });
});
