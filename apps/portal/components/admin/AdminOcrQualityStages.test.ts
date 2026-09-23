import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminOcrQualityStages from "./AdminOcrQualityStages.vue";

describe("AdminOcrQualityStages", () => {
  it("shows both owner stages and identifies the active page", async () => {
    const wrapper = await mountSuspended(AdminOcrQualityStages, {
      props: { active: "datasets" },
      global: { stubs: { NuxtLink: { props: ["to", "ariaCurrent"], template: "<a :href=\"to\" :aria-current=\"ariaCurrent\"><slot /></a>" } } },
    });

    expect(wrapper.find('a[href="/admin/annotations"]').text()).toBe("标注提案与审定");
    expect(wrapper.find('a[href="/admin/datasets"]').attributes("aria-current")).toBe("page");
    expect(wrapper.text()).toContain("平台负责标注审定与快照成员");
    expect(wrapper.text()).toContain("OCRKit 负责训练、评估和模型发布");
  });
});
