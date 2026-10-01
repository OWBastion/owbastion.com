import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
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

describe("bind page", () => {
  it("submits the manually entered invitation code", async () => {
    bindingState.state.value = "ready";
    const wrapper = await mountSuspended(BindPage, {
      global: {
        stubs: {
          UCard: { template: "<div><slot /></div>" },
          UInput: { props: ["modelValue"], template: "<input :value=\"modelValue\" @input=\"$emit('update:modelValue', $event.target.value)\" />" },
          UButton: { props: ["label"], template: "<button type=\"submit\">{{ label }}</button>" },
          UAlert: true,
        },
      },
    });

    await wrapper.get("input").setValue("abcdefghijkl");
    await wrapper.get("form").trigger("submit");

    expect(submit).toHaveBeenCalledWith("abcdefghijkl");
  });

  it("can regenerate a confirmation code from the entered invitation after expiry", async () => {
    bindingState.state.value = "ready";
    submit.mockClear();
    const wrapper = await mountSuspended(BindPage, {
      global: {
        stubs: {
          UCard: { template: "<div><slot /></div>" },
          UInput: { props: ["modelValue"], template: "<input :value=\"modelValue\" @input=\"$emit('update:modelValue', $event.target.value)\" />" },
          UButton: { props: ["label"], template: "<button type=\"button\" @click=\"$emit('click')\">{{ label }}</button>" },
          UAlert: true,
        },
      },
    });

    await wrapper.get("input").setValue("ABCDEFGHIJKL");
    bindingState.state.value = "expired";
    await flushPromises();
    await wrapper.get("button").trigger("click");

    expect(submit).toHaveBeenCalledWith("ABCDEFGHIJKL");
  });

  it("copies the verification command without a bot mention", async () => {
    bindingState.state.value = "waiting";
    bindingState.invite.value = { playerName: "Player", playerId: "1234" };
    bindingState.confirmationCode.value = "ABC234";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
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
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("/验证 ABC234");
    expect(wrapper.text()).not.toContain("@E54机器人");
  });
});
