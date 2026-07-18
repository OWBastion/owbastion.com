import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AchievementCatalog from "./AchievementCatalog.vue";

describe("AchievementCatalog", () => {
  it("marks a sunsetting challenge with its planned release version", async () => {
    const wrapper = await mountSuspended(AchievementCatalog, {
      props: { challenges: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "sunsetting", retiredVersion: "26.0713.2", submissionMode: "manual" }] },
    });
    expect(wrapper.text()).toContain("即将结束");
    expect(wrapper.text()).toContain("26.0713.2");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
  });

  it("marks owned achievements and keeps owned historical titles visible", async () => {
    const wrapper = await mountSuspended(AchievementCatalog, {
      props: {
        challenges: [{ challengeId: "title-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual" }],
        ownedTitles: [
          { grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2 },
          { grantId: "grant-2", titleKey: "HISTORICAL", label: "历史称号", icon: "scroll", category: "旧记录", condition: "完成旧挑战", scope: "global", grantedAt: 1 },
        ],
      },
    });
    expect(wrapper.findAll(".earned-status")).toHaveLength(2);
    expect(wrapper.text()).toContain("历史称号");
    expect(wrapper.findAll(".achievement-icon")).toHaveLength(2);
  });
});
