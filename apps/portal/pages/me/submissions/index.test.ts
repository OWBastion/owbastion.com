import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { clearNuxtData } from "#app";
import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SubmissionsPage from "./index.vue";

const api = vi.fn();
mockNuxtImport("usePortalApi", () => () => api);

const item = (id: string, mapName = "釜山") => ({ submissionId: id, status: "completed", mapName, createdAt: 1, updatedAt: 1 });
const list = (overrides: Record<string, unknown> = {}) => ({ contractVersion: "1", items: [item("sub-1")], page: 1, pageSize: 20, total: 1, hasMore: false, ...overrides });

beforeEach(() => {
  clearNuxtData();
  api.mockReset();
});

enableAutoUnmount(afterEach);

describe("submission history", () => {
  it("lists the player's submissions and links each to its detail", async () => {
    api.mockResolvedValue(list());
    const wrapper = await mountSuspended(SubmissionsPage);
    expect(api).toHaveBeenCalledWith("/v1/me/submissions?page=1&pageSize=20");
    const link = wrapper.find('a[href="/me/submissions/sub-1"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain("釜山");
  });

  it("shows the empty state when the player never submitted", async () => {
    api.mockResolvedValue(list({ items: [], total: 0 }));
    expect((await mountSuspended(SubmissionsPage)).text()).toContain("还没有提交");
  });

  it("pages through the full history", async () => {
    api.mockImplementation(async (path: string) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page") ?? "1");
      return list({ items: [item(`sub-${page}`, `Map ${page}`)], page, total: 25, hasMore: page < 2 });
    });
    const wrapper = await mountSuspended(SubmissionsPage);
    const next = wrapper.findAll("a, button").find((element) => element.text().trim() === "2");
    expect(next).toBeDefined();
    await next!.trigger("click");
    await flushPromises();
    expect(api.mock.calls.some(([path]) => String(path).includes("page=2"))).toBe(true);
    expect(wrapper.text()).toContain("Map 2");
  });

  it("keeps a single page list free of pagination controls", async () => {
    api.mockResolvedValue(list());
    const wrapper = await mountSuspended(SubmissionsPage);
    expect(wrapper.findAll("a, button").filter((element) => element.text().trim() === "2")).toHaveLength(0);
  });

  it("recovers from a read failure with retry", async () => {
    api.mockRejectedValueOnce(Object.assign(new Error("down"), { statusCode: 503 }));
    const wrapper = await mountSuspended(SubmissionsPage);
    expect(wrapper.text()).toContain("无法读取提交记录");
    api.mockResolvedValue(list());
    await wrapper.findAll("button").find((button) => button.text() === "重试")!.trigger("click");
    await flushPromises();
    expect(wrapper.find('a[href="/me/submissions/sub-1"]').exists()).toBe(true);
  });
});
