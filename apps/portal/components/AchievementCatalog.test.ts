import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AchievementCatalog from "./AchievementCatalog.vue";

const base = { family: "achievement", type: "title_achievement", kind: "title_achievement", icon: "trophy", iconUrl: null, category: "测试系列", evidenceRule: "截图", gameVersion: "26.01", submissionMode: "manual" };
const live = { ...base, challengeId: "c-live", titleKey: "LIVE", titleName: "进行中", condition: "完成挑战", status: "active" };
const ended = { ...base, challengeId: "c-ended", titleKey: "ENDED", titleName: "往日荣光", condition: "已结束的挑战", status: "ended" };

describe("AchievementCatalog", () => {
  it("lists ended titles after open ones and labels them in the detail sheet", async () => {
    const wrapper = await mountSuspended(AchievementCatalog, { props: { challenges: [ended, live] as never[] }, attachTo: document.body });
    const names = wrapper.findAll("button").map((button) => button.text());
    expect(names.findIndex((name) => name.includes("进行中"))).toBeLessThan(names.findIndex((name) => name.includes("往日荣光")));
    await wrapper.findAll("button").find((button) => button.text().includes("往日荣光"))!.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("已结束");
    wrapper.unmount();
  });
});
