import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import BindPage from "./bind.vue";

const submit = vi.fn();
const passkeyErrorCode = ref("PLAYER_ACCOUNT_EXISTS");
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
mockNuxtImport("usePasskeys", () => () => ({ busy: ref(false), errorMessage: ref(""), errorCode: passkeyErrorCode, registerInvitation: vi.fn() }));
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

    await wrapper.findAll("button").find((button) => button.text().includes("绑定 QQ 渠道"))!.trigger("click");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("重新生成确认码"))!.trigger("click");

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

    await wrapper.findAll("button").find((button) => button.text().includes("绑定 QQ 渠道"))!.trigger("click");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("复制指令"))!.trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("/验证 ABC234");
    expect(wrapper.text()).not.toContain("@E54机器人");
  });
});
