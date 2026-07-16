import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminDashboard from "./index.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/qq/groups") return Promise.resolve({ items: [{ groupOpenId: "group-1", enabled: true }] });
  if (path === "/v1/submissions?status=ready_for_review") return Promise.resolve({ items: [{ submissionId: "submission-1" }, { submissionId: "submission-2" }] });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin dashboard", () => {
  it("shows only workload summaries and functional links", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AdminDashboard, { global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });
    await flushPromises();

    expect(wrapper.text()).toContain("2 条待核对");
    expect(wrapper.text()).toContain("1 / 1 个已开放");
    expect(wrapper.find('input[aria-label="搜索玩家"]').exists()).toBe(false);
    expect(wrapper.find('a[href="/admin/reviews"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/admin/players"]').exists()).toBe(true);
  });
});
