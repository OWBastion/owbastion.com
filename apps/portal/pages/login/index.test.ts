import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./index.vue";

const loginWithPasskey = vi.fn();
const startQqLogin = vi.fn();
const attemptState = ref<"idle" | "waiting">("idle");
const attempt = ref<{ attemptId: string; attemptToken: string; code: string; expiresAt: number } | null>(null);

mockNuxtImport("usePasskeys", () => () => ({ busy: ref(false), errorMessage: ref(""), login: loginWithPasskey }));
mockNuxtImport("useLoginAttempt", () => () => ({
  state: attemptState, attempt, secondsLeft: ref(90), message: ref(""), start: startQqLogin, restore: vi.fn(), cancel: vi.fn(), copyCode: vi.fn(),
  safeReturnTo: (value: unknown) => typeof value === "string" ? value : "/me",
}));
mockNuxtImport("useLocalDevAuth", () => () => ({ accounts: ref([]), selectedAccountId: ref(""), loading: ref(false), errorMessage: ref(""), enabled: ref(false), load: vi.fn(), login: vi.fn() }));

const stubs = {
  UButton: { props: ["label", "disabled"], emits: ["click"], template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' },
  UAlert: true,
  USelect: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  attemptState.value = "idle";
  attempt.value = null;
  loginWithPasskey.mockClear();
  startQqLogin.mockClear();
});

describe("login page", () => {
  it("offers Passkey and QQ verification side by side and starts each method on demand", async () => {
    const wrapper = await mountSuspended(LoginPage, { global: { stubs } });
    await flushPromises();
    const buttons = wrapper.findAll("button");
    expect(buttons.map((button) => button.text())).toEqual(["使用 Passkey 登录", "使用 QQ 验证登录"]);

    await buttons[0]!.trigger("click");
    expect(loginWithPasskey).toHaveBeenCalledTimes(1);
    expect(startQqLogin).not.toHaveBeenCalled();
    await buttons[1]!.trigger("click");
    expect(startQqLogin).toHaveBeenCalledTimes(1);
  });

  it("shows the QQ verification command in place while a QQ attempt is waiting", async () => {
    attemptState.value = "waiting";
    attempt.value = { attemptId: "attempt-1", attemptToken: "token", code: "ABC234", expiresAt: Date.now() + 90_000 };
    const wrapper = await mountSuspended(LoginPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain("ABC234");
    expect(wrapper.text()).toContain("90 秒");
    expect(wrapper.text()).toContain("使用 Passkey 登录");
  });
});
