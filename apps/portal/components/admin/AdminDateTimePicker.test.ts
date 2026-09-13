import { describe, it, expect, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import AdminDateTimePicker from "./AdminDateTimePicker.vue";

describe("AdminDateTimePicker", () => {
  it("renders empty state placeholder when modelValue is null", async () => {
    const wrapper = await mountSuspended(AdminDateTimePicker, {
      props: { modelValue: null, placeholder: "选择开始时间" },
    });
    expect(wrapper.find('input[type="date"]').attributes("placeholder")).toBe("选择开始时间");
  });

  it("formats timestamp into display string when modelValue is provided", async () => {
    const ts = new Date(2030, 0, 1, 14, 30).getTime();
    const wrapper = await mountSuspended(AdminDateTimePicker, {
      props: { modelValue: ts },
    });
    expect((wrapper.find('input[type="date"]').element as HTMLInputElement).value).toBe("2030-01-01");
    expect((wrapper.find('input[type="time"]').element as HTMLInputElement).value).toBe("14:30");
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

  it("updates the timestamp when the inline date changes", async () => {
    const ts = new Date(2030, 0, 1, 14, 30).getTime();
    const wrapper = await mountSuspended(AdminDateTimePicker, { props: { modelValue: ts } });
    await wrapper.find('input[type="date"]').setValue("2030-01-02");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([new Date(2030, 0, 2, 14, 30).getTime()]);
  });
});
