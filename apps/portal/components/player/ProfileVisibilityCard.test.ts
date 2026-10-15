import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ProfileVisibilityCard from "./ProfileVisibilityCard.vue";

const portalApi = vi.fn(async () => ({ contractVersion: "1" as const, publicProfile: false }));
mockNuxtImport("usePortalApi", () => () => portalApi);

const stubs = {
  UCard: { template: "<div><slot /></div>" },
  USwitch: {
    props: ["modelValue", "disabled"],
    emits: ["update:modelValue"],
    template: '<button role="switch" type="button" :aria-checked="modelValue" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />',
  },
};

describe("profile visibility card", () => {
  it("writes the new value with an idempotency key and emits it", async () => {
    portalApi.mockClear();
    const wrapper = await mountSuspended(ProfileVisibilityCard, { props: { publicProfile: true }, global: { stubs } });
    const toggle = wrapper.get('[role="switch"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith("/v1/me/profile/visibility", expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      body: { contractVersion: "1", publicProfile: false },
    }));
    expect(wrapper.emitted("updated")).toEqual([[false]]);
    expect(wrapper.text()).not.toContain("保存失败");
  });

  it("restores the switch and reports the failure when the write fails", async () => {
    portalApi.mockRejectedValueOnce(new Error("unavailable"));
    const wrapper = await mountSuspended(ProfileVisibilityCard, { props: { publicProfile: true }, global: { stubs } });
    const toggle = wrapper.get('[role="switch"]');
    await toggle.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("updated")).toBeUndefined();
    expect(wrapper.get('[role="switch"]').attributes("aria-checked")).toBe("true");
    expect(wrapper.get('[role="alert"]').text()).toContain("unavailable");
  });
});
