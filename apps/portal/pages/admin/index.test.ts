import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminOverviewPage from "./index.vue";

const adminApi = vi.fn();
mockNuxtImport("useAdminApi", () => () => adminApi);

const reviewsOk = () => ({ items: [], total: 7 });
const migrationOk = () => ({ holders: [], total: 40, stats: { pendingHolderCount: 12, unclaimedGrantCount: 90, migratedGrantCount: 300 } });

function respond(overrides: Partial<Record<"reviews" | "migration", () => unknown>> = {}) {
  adminApi.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/submissions")) return (overrides.reviews ?? reviewsOk)();
    if (path.startsWith("/v1/title-grants")) return (overrides.migration ?? migrationOk)();
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe("/admin overview", () => {
  const mounted: Array<{ unmount(): void }> = [];
  afterEach(() => { for (const wrapper of mounted.splice(0)) wrapper.unmount(); });
  const mount = async () => { const wrapper = await mountSuspended(AdminOverviewPage); mounted.push(wrapper); return wrapper; };

  it("shows the pending review and unmigrated player counts and links to their queues", async () => {
    respond();
    const wrapper = await mount();
    await flushPromises();
    const card = (title: string) => wrapper.findAll("article").find((item) => item.text().includes(title))!;
    expect(card("待审核截图").text()).toContain("7");
    expect(card("未迁移玩家").text()).toContain("12");
    expect(card("待审核截图").find('a[href="/admin/reviews"]').exists()).toBe(true);
    expect(card("未迁移玩家").find('a[href="/admin/title-migration"]').exists()).toBe(true);
  });

  it("counts the same queue the review page lists, and only pending migration holders", async () => {
    respond();
    await mount();
    await flushPromises();
    const paths = adminApi.mock.calls.map(([path]) => String(path));
    expect(paths).toContain("/v1/submissions?page=1&pageSize=1&status=ready_for_review,ocr_review_required");
    expect(paths).toContain("/v1/title-grants?filter=pending&page=1&pageSize=1");
  });

  it("shows zero as a real count rather than a missing value", async () => {
    respond({ reviews: () => ({ items: [], total: 0 }) });
    const wrapper = await mount();
    await flushPromises();
    const card = wrapper.findAll("article").find((item) => item.text().includes("待审核截图"))!;
    expect(card.get(".todo-count").text()).toContain("0");
    expect(card.text()).not.toContain("—");
  });

  it("keeps the other count when one request fails, and retries only the failed one", async () => {
    let failing = true;
    respond({ migration: () => { if (failing) throw new Error("unavailable"); return migrationOk(); } });
    const wrapper = await mount();
    await flushPromises();
    const card = (title: string) => wrapper.findAll("article").find((item) => item.text().includes(title))!;
    expect(card("待审核截图").text()).toContain("7");
    expect(card("未迁移玩家").text()).toContain("unavailable");
    expect(card("未迁移玩家").find(".todo-count").exists()).toBe(false);

    failing = false;
    adminApi.mockClear();
    await card("未迁移玩家").findAll("button").find((button) => button.text() === "重试")!.trigger("click");
    await flushPromises();
    expect(card("未迁移玩家").text()).toContain("12");
    expect(adminApi.mock.calls.map(([path]) => String(path)).some((path) => path.startsWith("/v1/submissions"))).toBe(false);
  });
});
