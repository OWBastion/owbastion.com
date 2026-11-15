import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AchievementShelf from "./AchievementShelf.vue";

const mountShelf = (retiredCount?: number) => mountSuspended(AchievementShelf, {
  props: { title: "系列", count: "1/3", headingId: "series", retiredCount },
  slots: { default: "<li>现役</li>", retired: "<li>已停发</li>" },
});

describe("achievement shelf", () => {
  it("folds retired titles until the player expands them", async () => {
    const wrapper = await mountShelf(2);
    const toggle = wrapper.get("button");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(toggle.text()).toContain("不再发放");
    expect(wrapper.get("#series-retired").attributes("style")).toContain("display: none");

    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("#series-retired").attributes("style") ?? "").not.toContain("display: none");
  });

  it("shows no toggle when nothing is retired", async () => {
    const wrapper = await mountShelf(0);
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("已停发");
  });
});
