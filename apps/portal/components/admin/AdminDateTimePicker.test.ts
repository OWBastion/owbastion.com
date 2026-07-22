import { describe, it, expect, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import AdminDateTimePicker from "./AdminDateTimePicker.vue";

describe("AdminDateTimePicker", () => {
  it("renders empty state placeholder when modelValue is null", async () => {
    const wrapper = await mountSuspended(AdminDateTimePicker, {
      props: { modelValue: null, placeholder: "选择开始时间" },
    });
    expect(wrapper.text()).toContain("选择开始时间");
  });

  it("formats timestamp into display string when modelValue is provided", async () => {
    const ts = new Date(2030, 0, 1, 14, 30).getTime();
    const wrapper = await mountSuspended(AdminDateTimePicker, {
      props: { modelValue: ts },
    });
    expect(wrapper.text()).toContain("2030-01-01 14:30");
  });

  it("emits null when clear button is clicked", async () => {
    const ts = new Date(2030, 0, 1, 14, 30).getTime();
    const wrapper = await mountSuspended(AdminDateTimePicker, {
      props: { modelValue: ts },
    });
    const clearBtn = wrapper.find('button[aria-label="清除时间"]');
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[null]]);
  });
});
