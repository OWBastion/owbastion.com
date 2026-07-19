import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MyAchievementOverview from "./MyAchievementOverview.vue";

const challenges = [
  { challengeId: "title-1", family: "achievement" as const, type: "title_achievement" as const, kind: "title_achievement" as const, titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: "https://example.test/icon.png", category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active" as const, submissionMode: "manual" as const },
];

describe("MyAchievementOverview", () => {
  it("keeps retired titles in their series and groups map titles by map", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, {
      props: {
        challenges,
        titles: [
          { grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2 },
          { grantId: "grant-2", titleKey: "OLD", label: "历史称号", icon: "scroll", category: "旧记录", condition: "旧条件", scope: "global", grantedAt: 1 },
          { grantId: "grant-3", titleKey: "HAVANA_CONQUEROR", label: "征服者", icon: "trophy", category: "地图精通", condition: "完成哈瓦那", scope: "map", mapName: "哈瓦那", grantedAt: 4 },
          { grantId: "grant-4", titleKey: "HAVANA_DOMINATOR", label: "主宰", icon: "crown", category: "地图精通", condition: "精通哈瓦那", scope: "map", mapName: "哈瓦那", grantedAt: 3 },
          { grantId: "grant-5", titleKey: "KINGS_ROW_CONQUEROR", label: "征服者", icon: "trophy", category: "地图精通", condition: "完成国王大道", scope: "map", mapName: "国王大道", grantedAt: 5 },
        ],
      },
    });

    expect(wrapper.text()).toContain("1 / 1");
    expect(wrapper.text()).toContain("100%");
    expect(wrapper.text()).not.toContain("历史成就");
    expect(wrapper.text()).toContain("旧记录");
    expect(wrapper.text()).toContain("不再发放");
    expect(wrapper.text()).toContain("地图称号");
    expect(wrapper.text()).toContain("哈瓦那");
    expect(wrapper.text()).toContain("国王大道");
    expect(wrapper.findAll(".map-title-group")).toHaveLength(2);
    expect(wrapper.find(".map-title-collection").text()).not.toContain("不再发放");
    expect(wrapper.findAll(".retired-status")).toHaveLength(1);
    expect(wrapper.find(".progress-ring").attributes("aria-label")).toBe("成就完成率 100%");
    expect(wrapper.find(".achievement-icon.has-image").exists()).toBe(true);
    expect(wrapper.find(".earned-status-icon").text()).toBe("");
    expect(wrapper.findAll(".summary-icon")).toHaveLength(3);
  });

  it("shows the factual empty state for a player without titles", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, { props: { challenges, titles: [] } });
    expect(wrapper.text()).toContain("0%");
    expect(wrapper.text()).toContain("暂无称号");
    expect(wrapper.find(".earned-status-icon").exists()).toBe(false);
  });
});
