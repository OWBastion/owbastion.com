import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ChannelsPage from "./channels.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/qq/groups") return Promise.resolve({ items: [{ groupOpenId: "group-1", environment: "test", status: "pending", bindEnabled: false, verifyEnabled: false, updatedAt: 0 }] });
  if (path === "/v1/qq/groups/group-1") return Promise.resolve();
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin channels page", () => {
  it("promotes a discovered group from its dedicated page", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ChannelsPage);
    await flushPromises();
    const button = wrapper.findAll("button").find((candidate) => candidate.text().includes("设为活动群"))!;
    await button.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/qq/groups/group-1", expect.objectContaining({ method: "PUT" }));
    expect(adminApi).toHaveBeenCalledWith("/v1/qq/groups/group-1", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) }));
  });
});
