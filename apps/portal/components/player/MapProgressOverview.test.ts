import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MapProgressOverview from "./MapProgressOverview.vue";

const maps = [
  { mapId: "map.samoa", mapName: "萨摩亚", defaultGameplayRevisionId: "revision:map.samoa:default" },
  { mapId: "map.havana", mapName: "哈瓦那", defaultGameplayRevisionId: "revision:map.havana:default" },
];
const challenges = [
  { challengeId: "samoa.pioneer", mapId: "map.samoa", gameplayRevisionId: "revision:map.samoa:default", titleKey: "SAMOA_PIONEER", name: "开拓者", status: "active" as const },
  { challengeId: "samoa.conqueror", mapId: "map.samoa", gameplayRevisionId: "revision:map.samoa:default", titleKey: "SAMOA_CONQUEROR", name: "征服者", status: "active" as const },
];

describe("MapProgressOverview", () => {
  it("shows every current map, including zero-progress maps, and keeps map detail links", async () => {
    const wrapper = await mountSuspended(MapProgressOverview, {
      props: { maps, challenges, titles: [], profiles: [] },
      global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" }, UEmpty: { template: "<div />" } } },
    });

    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("哈瓦那");
    expect(wrapper.text()).toContain("地图称号 0 / 2");
    expect(wrapper.text()).toContain("暂无地图成就");
    expect(wrapper.findAll('a[href="/maps"]').length).toBe(2);
  });

  it("renders earned and unearned current targets with text markers", async () => {
    const wrapper = await mountSuspended(MapProgressOverview, {
      props: {
        maps: [maps[0]],
        challenges,
        titles: [{ grantId: "grant-1", titleKey: "SAMOA_PIONEER", scope: "map", mapId: "map.samoa", gameplayRevisionId: "revision:map.samoa:default" }],
        showMasteryFacts: false,
        showTargets: true,
      },
      global: { stubs: { NuxtLink: { template: "<a><slot /></a>" }, UEmpty: { template: "<div />" } } },
    });

    expect(wrapper.text()).toContain("开拓者");
    expect(wrapper.text()).toContain("征服者");
    expect(wrapper.text()).toContain("✓");
    expect(wrapper.text()).toContain("○");
    expect(wrapper.text()).toContain("已获得 1 / 2");
    expect(wrapper.text()).toContain("已获得 1 / 2 个地图成就");
    expect(wrapper.find("a .map-target-list").exists()).toBe(false);
  });

  it("does not show false title zeros when title progress is unavailable", async () => {
    const wrapper = await mountSuspended(MapProgressOverview, {
      props: {
        maps: [maps[0]],
        challenges,
        titles: [],
        profiles: [{ mapId: "map.samoa", gameplayRevisionId: "revision:map.samoa:default", totalXp: 120, verifiedRunCount: 2, difficultyStats: [], highestCompletedDifficulty: "T2", recentRuns: [] }],
        titleProgressAvailable: false,
      },
      global: { stubs: { NuxtLink: { template: "<a><slot /></a>" }, UEmpty: { template: "<div />" } } },
    });

    expect(wrapper.text()).toContain("称号进度暂不可用");
    expect(wrapper.text()).not.toContain("0 / 2");
    expect(wrapper.text()).toContain("精通 XP");
  });
});
