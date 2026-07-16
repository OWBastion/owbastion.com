import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ChannelsPage from "./channels.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/qq/groups") return Promise.resolve({ items: [{ groupOpenId: "group-1", environment: "test", enabled: false, updatedAt: 0 }] });
  if (path === "/v1/qq/groups/group-1") return Promise.resolve();
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin channels page", () => {
  it("updates a group access state from its dedicated page", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ChannelsPage);
    await flushPromises();
    const toggle = wrapper.get(".toggle");
    await toggle.trigger("click");
    await flushPromises();
    expect(toggle.attributes("aria-pressed")).toBe("true");
    expect(adminApi).toHaveBeenCalledWith("/v1/qq/groups/group-1", expect.objectContaining({ method: "PUT" }));
  });
});
