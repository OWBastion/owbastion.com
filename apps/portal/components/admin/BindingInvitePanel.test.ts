import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BindingInvitePanel from "./BindingInvitePanel.vue";

let detailResponseOverride: Promise<unknown> | null = null;

const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path.startsWith("/v1/title-grants/holder?")) {
    if (detailResponseOverride) return detailResponseOverride;
    const page = new URLSearchParams(path.split("?")[1]).get("page");
    return Promise.resolve({
      holder: { holderName: "历史玩家", totalCount: 2, unclaimedCount: 2, status: "pending" },
      items: [page === "2" ? { grantId: "hist.2", label: "先锋", category: "地图称号", mapName: "测试地图", holderName: "历史玩家", status: "unclaimed" } : { grantId: "hist.1", label: "征服者", category: "地图称号", mapName: "测试地图", holderName: "历史玩家", status: "unclaimed" }],
      page: Number(page ?? "1"),
      pageSize: 100,
      total: 2,
      hasMore: page !== "2",
    });
  }
  if (path.startsWith("/v1/title-grants?")) {
    return Promise.resolve({
      holders: [{ holderName: "历史玩家", totalCount: 1, unclaimedCount: 1, status: "pending" }],
      page: 1,
      pageSize: 50,
      total: 1,
      hasMore: false,
      filter: "pending",
      stats: { pendingHolderCount: 1, unclaimedGrantCount: 1, migratedGrantCount: 0 },
    });
  }
  if (path === "/v1/binding-invites" && options?.method === "POST") {
    return Promise.resolve({
      inviteId: "invite-1",
      code: "ABCD1234",
      playerName: "玩家",
      playerId: "1234",
      expiresAt: Date.now() + 3600_000,
      historicalMigration: { requestedCount: Array.isArray(options.body?.historicalTitleGrantIds) ? options.body.historicalTitleGrantIds.length : 0 },
    });
  }
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useToast", () => () => ({ add: vi.fn() }));
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("BindingInvitePanel", () => {
  beforeEach(() => {
    adminApi.mockClear();
    detailResponseOverride = null;
  });

  it("loads pending holders and authorizes complete unclaimed grants for the selected holder", async () => {
    const wrapper = await mountSuspended(BindingInvitePanel, { attachTo: document.body });
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("filter=pending"));
    await wrapper.get(".historical-holder").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("/v1/title-grants/holder?holderName="));
    await wrapper.get('input[aria-label="目标 BattleTag"]').setValue("玩家#1234");
    await wrapper.get('button[type="submit"]').trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/binding-invites", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ historicalTitleGrantIds: ["hist.1", "hist.2"] }),
    }));
  });

  it("disables invite submission while holder details are loading", async () => {
    let resolveDetail!: (value: unknown) => void;
    detailResponseOverride = new Promise((resolve) => { resolveDetail = resolve; });
    const wrapper = await mountSuspended(BindingInvitePanel, { attachTo: document.body });
    await flushPromises();
    await wrapper.get(".historical-holder").trigger("click");
    await wrapper.get('input[aria-label="目标 BattleTag"]').setValue("玩家#1234");
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    resolveDetail({
      holder: { holderName: "历史玩家", totalCount: 1, unclaimedCount: 1, status: "pending" },
      items: [{ grantId: "hist.1", label: "征服者", category: "地图称号", holderName: "历史玩家", status: "unclaimed" }],
      hasMore: false,
    });
    await flushPromises();
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeUndefined();
  });
});
