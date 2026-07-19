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
