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
    expect(wrapper.text()).toContain("未完成");
    expect(wrapper.text()).toContain("暂无地图成就");
    expect(wrapper.find('a[href="/maps?mapId=map.samoa"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/maps?mapId=map.havana"]').exists()).toBe(true);
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
    expect(wrapper.text()).toContain("已完成 1 / 2");
    expect(wrapper.text()).not.toContain("个地图成就");
  });
});
