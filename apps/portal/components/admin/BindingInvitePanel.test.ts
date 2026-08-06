import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import BindingInvitePanel from "./BindingInvitePanel.vue";

const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path.startsWith("/v1/title-grants/holder?")) {
    return Promise.resolve({
      holder: { holderName: "历史玩家", totalCount: 1, unclaimedCount: 1, status: "pending" },
      items: [{ grantId: "hist.1", label: "征服者", category: "地图称号", mapName: "测试地图", holderName: "历史玩家", status: "unclaimed" }],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
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
  it("loads pending holders and authorizes complete unclaimed grants for the selected holder", async () => {
    adminApi.mockClear();
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
      body: expect.objectContaining({ historicalTitleGrantIds: ["hist.1"] }),
    }));
  });
});
