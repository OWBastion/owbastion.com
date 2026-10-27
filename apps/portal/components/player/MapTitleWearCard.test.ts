import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MapTitleWearCard from "./MapTitleWearCard.vue";

const portalApi = vi.fn(async (_path: string, options?: { body: { wearMapTitles: boolean } }) => ({ contractVersion: "1" as const, wearMapTitles: options?.body.wearMapTitles ?? true }));
mockNuxtImport("usePortalApi", () => () => portalApi);

const stubs = {
  USwitch: {
    props: ["modelValue", "disabled"],
    emits: ["update:modelValue"],
    template: '<button role="switch" type="button" :aria-checked="modelValue" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />',
  },
};

describe("map title wear card", () => {
  it("writes the new preference with an idempotency key and reflects it", async () => {
    portalApi.mockClear();
    const wrapper = await mountSuspended(MapTitleWearCard, { global: { stubs } });
    const toggle = wrapper.get('[role="switch"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith("/v1/me/titles/map-wear", expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      body: { wearMapTitles: false },
    }));
    expect(wrapper.get('[role="switch"]').attributes("aria-checked")).toBe("false");
  });

  it("keeps the switch unchanged and reports the failure when the write fails", async () => {
    portalApi.mockRejectedValueOnce(new Error("unavailable"));
    const wrapper = await mountSuspended(MapTitleWearCard, { global: { stubs } });
    const before = wrapper.get('[role="switch"]').attributes("aria-checked");
    await wrapper.get('[role="switch"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="switch"]').attributes("aria-checked")).toBe(before);
    expect(wrapper.get('[role="alert"]').text()).toContain("unavailable");
  });
});
