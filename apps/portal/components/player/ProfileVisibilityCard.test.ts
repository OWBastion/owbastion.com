import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ProfileVisibilityCard from "./ProfileVisibilityCard.vue";

const portalApi = vi.fn(async (_path: string, options?: { body: { publicProfile: boolean; hideBattleTag: boolean } }) => ({ contractVersion: "1" as const, publicProfile: options?.body.publicProfile ?? true, hideBattleTag: options?.body.hideBattleTag ?? false }));
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
    const wrapper = await mountSuspended(ProfileVisibilityCard, { props: { publicProfile: true, hideBattleTag: false }, global: { stubs } });
    const toggle = wrapper.findAll('[role="switch"]')[0]!;
    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith("/v1/me/profile/visibility", expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      body: { contractVersion: "1", publicProfile: false, hideBattleTag: false },
    }));
    expect(wrapper.emitted("updated")).toEqual([[{ contractVersion: "1", publicProfile: false, hideBattleTag: false }]]);
    expect(wrapper.text()).not.toContain("保存失败");
  });

  it("restores the switch and reports the failure when the write fails", async () => {
    portalApi.mockRejectedValueOnce(new Error("unavailable"));
    const wrapper = await mountSuspended(ProfileVisibilityCard, { props: { publicProfile: true, hideBattleTag: false }, global: { stubs } });
    const toggle = wrapper.findAll('[role="switch"]')[0]!;
    await toggle.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("updated")).toBeUndefined();
    expect(wrapper.findAll('[role="switch"]')[0]!.attributes("aria-checked")).toBe("true");
    expect(wrapper.get('[role="alert"]').text()).toContain("unavailable");
  });

  it("hides the BattleTag toggle while the profile is private and writes both flags together", async () => {
    portalApi.mockClear();
    const wrapper = await mountSuspended(ProfileVisibilityCard, { props: { publicProfile: true, hideBattleTag: false }, global: { stubs } });
    await wrapper.findAll('[role="switch"]')[1]!.trigger("click");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith("/v1/me/profile/visibility", expect.objectContaining({ body: { contractVersion: "1", publicProfile: true, hideBattleTag: true } }));
    await wrapper.setProps({ publicProfile: false });
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(1);
  });
});
