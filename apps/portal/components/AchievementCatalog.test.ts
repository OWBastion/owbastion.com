import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AchievementCatalog from "./AchievementCatalog.vue";

const base = { family: "achievement", type: "title_achievement", kind: "title_achievement", icon: "trophy", iconUrl: null, category: "测试系列", evidenceRule: "截图", gameVersion: "26.01", submissionMode: "manual" };
const live = { ...base, challengeId: "c-live", titleKey: "LIVE", titleName: "进行中", condition: "完成挑战", status: "active" };
const sunsetting = { ...base, challengeId: "c-sun", titleKey: "SUN", titleName: "即将下线", condition: "限时挑战", status: "sunsetting", retiredVersion: "26.1101.1" };
const ended = { ...base, challengeId: "c-ended", titleKey: "ENDED", titleName: "往日荣光", condition: "已结束的挑战", status: "ended" };

describe("AchievementCatalog", () => {
  it("lists ended titles after open ones and marks them with a status icon and explains it in the detail sheet", async () => {
    const wrapper = await mountSuspended(AchievementCatalog, { props: { challenges: [ended, live, sunsetting] as never[] }, attachTo: document.body });
    const names = wrapper.findAll("button").map((button) => button.text());
    expect(names.findIndex((name) => name.includes("进行中"))).toBeLessThan(names.findIndex((name) => name.includes("往日荣光")));
    await wrapper.findAll("button").find((button) => button.text().includes("往日荣光"))!.trigger("click");
    await flushPromises();
    expect(wrapper.find('[aria-label="即将结束"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="不再发放"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("26.1101.1");
    expect(wrapper.text()).not.toContain("不再发放");
    expect(document.body.textContent).toContain("不再发放");
    wrapper.unmount();
  });
});
