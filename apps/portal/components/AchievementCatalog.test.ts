import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AchievementCatalog from "./AchievementCatalog.vue";

describe("AchievementCatalog", () => {
  it("marks a sunsetting challenge with its planned release version", async () => {
    const wrapper = await mountSuspended(AchievementCatalog, {
      props: { challenges: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: null, category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "sunsetting", retiredVersion: "26.0713.2", submissionMode: "manual" }] },
    });
    expect(wrapper.text()).toContain("即将结束");
    expect(wrapper.text()).toContain("26.0713.2");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
  });

  it("sorts series and titles in zh-CN order", async () => {
    const wrapper = await mountSuspended(AchievementCatalog, {
      props: {
        challenges: [
          { challengeId: "b", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "B", titleName: "斑马", icon: "trophy", category: "生存", condition: "后", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual" },
          { challengeId: "a", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "A", titleName: "测试称号", icon: "trophy", category: "极限操作", condition: "前", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual" },
          { challengeId: "c", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "C", titleName: "暗影", icon: "trophy", category: "生存", condition: "中", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual" },
        ],
      },
    });
    const headings = wrapper.findAll("h2").map((heading) => heading.text());
    expect(headings).toEqual(["极限操作", "生存"]);
    const names = wrapper.findAll(".achievement-card strong").map((node) => node.text());
    expect(names).toEqual(["测试称号", "暗影", "斑马"]);
  });

  it("renders only public achievement data", async () => {
    const wrapper = await mountSuspended(AchievementCatalog, {
      props: {
        challenges: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: null, category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual" }],
      },
    });
    expect(wrapper.text()).toContain("测试称号");
    expect(wrapper.find(".earned-status").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("历史成就");
  });
});
