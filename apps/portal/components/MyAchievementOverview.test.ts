import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MyAchievementOverview from "./MyAchievementOverview.vue";
import MapProgressOverview from "./player/MapProgressOverview.vue";

const challenges = [
  { challengeId: "title-1", family: "achievement" as const, type: "title_achievement" as const, kind: "title_achievement" as const, titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: "https://example.test/icon.png", category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active" as const, submissionMode: "manual" as const },
];

describe("MyAchievementOverview", () => {
  it("keeps retired titles in their series and groups map titles by map", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, {
      props: {
        challenges,
        titles: [
          { grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2, equipped: true },
          { grantId: "grant-2", titleKey: "OLD", label: "历史称号", icon: "scroll", category: "旧记录", condition: "旧条件", scope: "global", grantedAt: 1 },
          { grantId: "grant-3", titleKey: "HAVANA_CONQUEROR", label: "征服者", icon: "trophy", category: "地图精通", condition: "完成哈瓦那", scope: "map", mapName: "哈瓦那", grantedAt: 4, equipped: true },
          { grantId: "grant-4", titleKey: "HAVANA_DOMINATOR", label: "主宰", icon: "crown", category: "地图精通", condition: "精通哈瓦那", scope: "map", mapName: "哈瓦那", grantedAt: 3 },
          { grantId: "grant-5", titleKey: "KINGS_ROW_CONQUEROR", label: "征服者", icon: "trophy", category: "地图精通", condition: "完成国王大道", scope: "map", mapName: "国王大道", grantedAt: 5 },
        ],
      },
    });

    expect(wrapper.text()).toContain("已获得 1 / 1");
    expect(wrapper.text()).not.toContain("历史成就");
    expect(wrapper.text()).toContain("旧记录");
    expect(wrapper.text()).toContain("不再发放");
    expect(wrapper.text()).toContain("地图称号");
    expect(wrapper.text()).toContain("哈瓦那");
    expect(wrapper.text()).toContain("国王大道");
    expect(wrapper.text()).toContain("已佩戴 1 / 10");
    const equipRetiredTitle = wrapper.find('button[aria-label="佩戴 历史称号"]');
    expect(equipRetiredTitle.exists()).toBe(true);
    expect(equipRetiredTitle.attributes("disabled")).toBeUndefined();
    await equipRetiredTitle.trigger("click");
    expect(wrapper.emitted("toggleEquipped")).toEqual([["grant-2"]]);
    expect(wrapper.text().match(/不再发放/g)).toHaveLength(1);
    const mapHeadings = wrapper.findAll("h3").map((heading) => heading.text()).filter((heading) => ["国王大道", "哈瓦那"].includes(heading));
    expect(mapHeadings).toEqual(["国王大道", "哈瓦那"]);
  });

  it("shows the factual empty state for a player without titles", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, { props: { challenges, titles: [] } });
    expect(wrapper.text()).toContain("已获得 0 / 1");
    expect(wrapper.text()).toContain("暂无称号");
    expect(wrapper.find('[role="img"][aria-label="已获得"]').exists()).toBe(false);
  });

  it("does not show equipment actions for map-scoped catalog cards", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, {
      props: {
        challenges: [...challenges, { ...challenges[0], challengeId: "map-title-1", titleKey: "MAP_TITLE", titleName: "地图称号" }],
        titles: [{ grantId: "map-grant-1", titleKey: "MAP_TITLE", label: "地图称号", icon: "map", category: "地图", condition: "完成地图挑战", scope: "map", mapName: "哈瓦那", grantedAt: 1 }],
      },
    });

    expect(wrapper.find('button[aria-label="佩戴 地图称号"]').exists()).toBe(false);
  });

  it("keeps map achievement progress separate and includes a zero-progress map", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, {
      props: {
        challenges,
        titles: [{ grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2 }],
        maps: [
          { mapId: "map.havana", mapName: "哈瓦那", defaultGameplayRevisionId: "revision:havana:default" },
          { mapId: "map.paraiso", mapName: "帕拉伊苏", defaultGameplayRevisionId: "revision:paraiso:default" },
        ],
        mapChallenges: [
          { challengeId: "havana.pioneer", mapId: "map.havana", gameplayRevisionId: "revision:havana:default", titleKey: "HAVANA_PIONEER", name: "开拓者", status: "active" },
          { challengeId: "paraiso.pioneer", mapId: "map.paraiso", gameplayRevisionId: "revision:paraiso:default", titleKey: "PARAISO_PIONEER", name: "开拓者", status: "active" },
        ],
      },
      global: { stubs: { MapProgressOverview } },
    });

    expect(wrapper.text()).toContain("地图成就");
    expect(wrapper.text()).toContain("哈瓦那");
    expect(wrapper.text()).toContain("帕拉伊苏");
    expect(wrapper.text()).toContain("已获得 0 / 1");
    expect(wrapper.text()).toContain("通用成就");
  });
});
