import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MyAchievementOverview from "./MyAchievementOverview.vue";

const challenges = [
  { challengeId: "title-1", family: "achievement" as const, type: "title_achievement" as const, kind: "title_achievement" as const, titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: null, category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active" as const, submissionMode: "manual" as const },
];

describe("MyAchievementOverview", () => {
  it("computes the completion rate and retains historical titles", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, {
      props: {
        challenges,
        titles: [
          { grantId: "grant-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 2 },
          { grantId: "grant-2", titleKey: "OLD", label: "历史称号", icon: "scroll", category: "旧记录", condition: "旧条件", scope: "global", grantedAt: 1 },
        ],
      },
    });

    expect(wrapper.text()).toContain("1 / 1");
    expect(wrapper.text()).toContain("100%");
    expect(wrapper.text()).toContain("历史成就");
    expect(wrapper.find(".progress-ring").attributes("aria-label")).toBe("成就完成率 100%");
  });

  it("shows the factual empty state for a player without titles", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, { props: { challenges, titles: [] } });
    expect(wrapper.text()).toContain("0%");
    expect(wrapper.text()).toContain("暂无称号");
    expect(wrapper.find(".earned-status").exists()).toBe(false);
  });
});
