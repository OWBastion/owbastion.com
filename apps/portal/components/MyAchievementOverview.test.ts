import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MyAchievementOverview from "./MyAchievementOverview.vue";

const challenge = { challengeId: "c-1", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "TEST", titleName: "测试称号", icon: "trophy", iconUrl: null, category: "测试", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: "26.0713.1", status: "active", submissionMode: "manual" };
const owned = { grantId: "g-1", titleKey: "TEST", label: "测试称号", icon: "trophy", category: "测试", condition: "完成挑战", scope: "global", grantedAt: Date.UTC(2026, 8, 12, 4) };

describe("MyAchievementOverview", () => {
  it("shows when an owned title was granted in its detail sheet", async () => {
    const wrapper = await mountSuspended(MyAchievementOverview, { props: { challenges: [challenge as never], titles: [owned as never] }, attachTo: document.body });
    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("获得于 2026年9月12日");
    wrapper.unmount();
  });
});
