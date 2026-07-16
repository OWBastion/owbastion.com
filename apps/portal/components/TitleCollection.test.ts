import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import TitleCollection from "./TitleCollection.vue";

const titles = [
  { grantId: "1", titleKey: "PIONEER", label: "开拓者", category: "社区贡献系列", condition: "完成暴雪世界地狱难度。", scope: "map" as const, mapName: "暴雪世界", grantedAt: 30 },
  { grantId: "2", titleKey: "DOMINATOR", label: "主宰", category: "地图精通系列", condition: "通关对应地图地狱难度。", scope: "map" as const, mapName: "暴雪世界", grantedAt: 20 },
  { grantId: "3", titleKey: "CONQUEROR", label: "征服者", category: "地图精通系列", condition: "通关对应地图传奇难度。", scope: "map" as const, mapName: "哈瓦那", grantedAt: 10 },
  { grantId: "4", titleKey: "EVENT", label: "幸运星", category: "随机事件系列", condition: "连续十次抽到增益事件并通关。", scope: "global" as const, grantedAt: 40 },
  { grantId: "5", titleKey: "EVENT_2", label: "福星高照", category: "随机事件系列", condition: "历史称号。", scope: "global" as const, grantedAt: 5 },
  { grantId: "6", titleKey: "LONG", label: "这是一个超长的称号测试字段如果到这里还没有被截断", category: "开发保留", condition: "这是一段用于确认长说明自然换行的测试文字。", scope: "global" as const, grantedAt: 35 },
];

describe("TitleCollection", () => {
  it("separates map titles, groups global titles by category, and orders every level by newest grant", async () => {
    const wrapper = await mountSuspended(TitleCollection, { props: { titles } });

    const summaries = wrapper.findAll("summary").map((summary) => summary.text());
    expect(summaries).toEqual(["地图专属地图称号3 项", "暴雪世界2 项", "哈瓦那1 项", "通用称号随机事件系列2 项", "通用称号开发保留1 项"]);
    expect(wrapper.findAll(".title-card h3").map((title) => title.text())).toEqual(["开拓者", "主宰", "征服者", "幸运星", "福星高照", "这是一个超长的称号测试字段如果到这里还没有被截断"]);
    expect(wrapper.text()).toContain("开拓者");
    expect(wrapper.text()).toContain("完成暴雪世界地狱难度。");
    expect(wrapper.text()).toContain("连续十次抽到增益事件并通关。");
    expect(wrapper.text()).toContain("这是一个超长的称号测试字段如果到这里还没有被截断");
    expect(wrapper.text()).toContain("这是一段用于确认长说明自然换行的测试文字。");
    expect(wrapper.text()).not.toContain("社区贡献系列");
  });

  it("opens only the latest title's top-level group and its map when the latest title is map-scoped", async () => {
    const wrapper = await mountSuspended(TitleCollection, { props: { titles: [...titles.filter((title) => title.scope === "map"), { ...titles[3]!, grantedAt: 1 }] } });
    const details = wrapper.findAll("details");

    expect((details[0]!.element as HTMLDetailsElement).open).toBe(true);
    expect((details[1]!.element as HTMLDetailsElement).open).toBe(true);
    expect((details[2]!.element as HTMLDetailsElement).open).toBe(false);
    expect((details[3]!.element as HTMLDetailsElement).open).toBe(false);
  });

  it("opens only the latest global category and gives every control an accessible name", async () => {
    const wrapper = await mountSuspended(TitleCollection, { props: { titles } });
    const details = wrapper.findAll("details");

    expect((details[0]!.element as HTMLDetailsElement).open).toBe(false);
    expect((details[3]!.element as HTMLDetailsElement).open).toBe(true);
    expect(wrapper.get('summary[aria-label="地图称号，3 项称号"]').text()).toContain("3 项");
    expect(wrapper.get('summary[aria-label="随机事件系列，2 项称号"]').exists()).toBe(true);
    expect(wrapper.get('summary[aria-label="暴雪世界，2 项称号"]').exists()).toBe(true);
  });
});
