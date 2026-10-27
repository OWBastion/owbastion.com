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
  rejectionMessage: ref(undefined),
  refreshing: ref(false),
  refreshStatus: vi.fn(),
  submit,
};

mockNuxtImport("useBindingInvite", () => () => bindingState);
mockNuxtImport("useTurnstile", () => () => ({ element: ref(), token: ref("turnstile-token"), failed: ref(false), reset: vi.fn() }));

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

    expect(submit).toHaveBeenCalledWith("abcdefghijkl", "turnstile-token");
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

    expect(submit).toHaveBeenCalledWith("ABCDEFGHIJKL", "turnstile-token");
  });

  it("asks a Player-code invitee for a BattleTag and submits it with the code", async () => {
    bindingState.state.value = "ready";
    submit.mockClear();
    const wrapper = await mountSuspended(BindPage, {
      route: "/bind?player-code=FRIEND-1",
      global: {
        stubs: {
          UInput: { props: ["modelValue"], template: "<input :value=\"modelValue\" @input=\"$emit('update:modelValue', $event.target.value)\" />" },
          UButton: { props: ["label"], template: "<button type=\"submit\">{{ label }}</button>" },
          UAlert: true,
        },
      },
    });

    const [code, battleTag] = wrapper.findAll("input");
    expect((code!.element as HTMLInputElement).value).toBe("FRIEND-1");
    await battleTag!.setValue("Tracer#1234");
    await wrapper.get("form").trigger("submit");

    expect(submit).toHaveBeenCalledWith("FRIEND-1", "turnstile-token", { playerName: "Tracer", playerId: "1234" });
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
