import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import BindPage from "./bind.vue";

const submit = vi.fn();
const bindingState = {
  state: ref("expired"),
  invite: ref(null),
  confirmationCode: ref(""),
  errorMessage: ref(""),
  refreshing: ref(false),
  refreshStatus: vi.fn(),
  submit,
};

mockNuxtImport("useBindingInvite", () => () => bindingState);
mockNuxtImport("useRoute", () => () => ({ query: { code: "ABCDEFGHIJKL" } }));

describe("bind page", () => {
  it("can regenerate a confirmation code from the original invitation after expiry", async () => {
    const wrapper = await mountSuspended(BindPage, {
      global: {
        stubs: {
          UCard: { template: "<div><slot /></div>" },
          UButton: { props: ["label"], template: "<button @click=\"$emit('click')\">{{ label }}</button>" },
          UAlert: true,
        },
      },
    });

    await wrapper.get("button").trigger("click");

    expect(submit).toHaveBeenCalledWith("ABCDEFGHIJKL");
  });
});
