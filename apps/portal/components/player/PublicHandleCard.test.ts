import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PublicHandleCard from "./PublicHandleCard.vue";

const portalApi = vi.fn(async () => ({ contractVersion: "1" as const, publicHandle: "teakowa" }));
mockNuxtImport("usePortalApi", () => () => portalApi);

const stubs = {
  UCard: { template: "<div><slot /></div>" },
  UInput: {
    props: ["modelValue", "disabled"],
    emits: ["update:modelValue"],
    template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  UButton: {
    props: ["disabled", "label"],
    template: '<button type="submit" :disabled="disabled">{{ label }}</button>',
  },
};

describe("public handle settings", () => {
  it("writes a canonical ID and presents the share URL when public", async () => {
    portalApi.mockReset();
    portalApi.mockResolvedValue({ contractVersion: "1", publicHandle: "teakowa" });
    const wrapper = await mountSuspended(PublicHandleCard, {
      props: { publicHandle: null, publicProfile: true },
      global: { stubs },
    });
    await wrapper.get("input").setValue("Teakowa");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith("/v1/me/profile/handle", expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      body: { contractVersion: "1", publicHandle: "teakowa" },
    }));
    expect(wrapper.emitted("updated")).toEqual([["teakowa"]]);
    await wrapper.setProps({ publicHandle: "teakowa" });
    expect(wrapper.find('a[href="/u/teakowa"]').exists()).toBe(true);
  });

  it("rejects reserved names and hides links for non-public profiles", async () => {
    portalApi.mockClear();
    const wrapper = await mountSuspended(PublicHandleCard, {
      props: { publicHandle: "my-id", publicProfile: false },
      global: { stubs },
    });
    await wrapper.get("input").setValue("admin");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("无效的平台 ID");
    expect(portalApi).not.toHaveBeenCalled();
    expect(wrapper.find('a[href="/u/my-id"]').exists()).toBe(false);
  });
});
