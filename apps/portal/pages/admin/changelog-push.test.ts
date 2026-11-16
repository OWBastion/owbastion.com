import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ChangelogPush from "./changelog-push.vue";

const api = vi.hoisted(() => vi.fn(async (path: string) => path.startsWith("/v1/qq/groups")
  ? { items: [
    { groupOpenId: "group.a", displayName: "主群", status: "active" },
    { groupOpenId: "group.b", displayName: "测试群", status: "pending" },
    { groupOpenId: "group.gone", displayName: "已断开", status: "disconnected" },
  ] }
  : { items: [{ version: "26.1115.3", groupOpenId: "group.a", status: "sent", retryable: null, errorCode: null, updatedAt: 1 }] }));
mockNuxtImport("useAdminApi", () => () => api);

describe("changelog push page", () => {
  it("stays rendered while groups are ticked and asks to confirm a resend", async () => {
    const wrapper = await mountSuspended(ChangelogPush);
    await flushPromises();

    expect(wrapper.text()).toContain("主群");
    expect(wrapper.text()).not.toContain("已断开");
    const boxes = wrapper.findAll("button[role=checkbox]");
    await boxes[1]!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("测试群");
    expect(wrapper.text()).not.toContain("确认重新发送");

    await boxes[0]!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("主群");
    expect(wrapper.text()).toContain("确认重新发送");
  });
});
