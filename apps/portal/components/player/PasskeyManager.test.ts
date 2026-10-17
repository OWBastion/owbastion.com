import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PasskeyManager from "./PasskeyManager.vue";

const api = vi.fn(async () => ({ contractVersion: "1", items: [{ passkeyId: "p1", name: "手机", createdAt: 1, lastUsedAt: null }], qqBound: true }));
const registerCurrentPlayer = vi.fn(async (_name: string) => true);

mockNuxtImport("usePortalApi", () => () => api);
mockNuxtImport("usePasskeys", () => () => ({ busy: ref(false), errorMessage: ref(""), registerCurrentPlayer }));

describe("PasskeyManager", () => {
  beforeEach(() => { registerCurrentPlayer.mockClear(); });

  it("shows the name field only after adding is initiated, and registers with the entered name on save", async () => {
    const wrapper = await mountSuspended(PasskeyManager);
    await flushPromises();
    expect(wrapper.find("input").exists()).toBe(false);
    expect(registerCurrentPlayer).not.toHaveBeenCalled();

    await wrapper.get(".passkey-add-button").trigger("click");
    expect(registerCurrentPlayer).not.toHaveBeenCalled();
    await wrapper.get("input").setValue("笔记本");
    await wrapper.findAll("button").find((button) => button.text() === "保存")!.trigger("click");
    await flushPromises();

    expect(registerCurrentPlayer).toHaveBeenCalledWith("笔记本");
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("falls back to the default name when saved empty, and cancel registers nothing", async () => {
    const wrapper = await mountSuspended(PasskeyManager);
    await flushPromises();

    await wrapper.get(".passkey-add-button").trigger("click");
    await wrapper.get("input").setValue("  ");
    await wrapper.findAll("button").find((button) => button.text() === "保存")!.trigger("click");
    await flushPromises();
    expect(registerCurrentPlayer).toHaveBeenCalledWith("此设备");

    await wrapper.get(".passkey-add-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "取消")!.trigger("click");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(registerCurrentPlayer).toHaveBeenCalledTimes(1);
  });
});
