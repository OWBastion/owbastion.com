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
  if (path === "/v1/binding-invites/batch") return Promise.resolve({ items: [{ inviteId: "00000000-0000-0000-0000-000000000001", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1 }] });
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

  it("keeps the search input when a search returns no holders", async () => {
    adminApi.mockImplementationOnce(() => Promise.resolve({ holders: [] }));
    const wrapper = await mountSuspended(BindingInvitePanel);
    await flushPromises();
    expect(wrapper.find('input[aria-label="搜索历史持有者或称号"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("暂无未关联称号");
  });

  it("loads pending holders and authorizes complete unclaimed grants for the selected holder", async () => {
    const wrapper = await mountSuspended(BindingInvitePanel, { attachTo: document.body });
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("filter=pending"));
    await wrapper.get('button[role="radio"]').trigger("click");
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
    await wrapper.get('button[role="radio"]').trigger("click");
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

  describe("batch mode", () => {
    const openBatch = async () => {
      const wrapper = await mountSuspended(BindingInvitePanel);
      await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "批量")!.trigger("click");
      return wrapper;
    };

    it("switches modes with aria-pressed chips and hides historical title authorization in batch", async () => {
      const wrapper = await openBatch();
      const chips = wrapper.findAll('[aria-label="生成方式"] button');
      expect(chips.map((chip) => chip.attributes("aria-pressed"))).toEqual(["false", "true"]);
      expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain("历史称号");
    });

    it("generates one invitation per valid BattleTag and exposes its copy action", async () => {
      adminApi.mockClear();
      const wrapper = await openBatch();
      await wrapper.find("textarea").setValue("Player#1234\nAnother#5678");
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(adminApi).toHaveBeenCalledWith("/v1/binding-invites/batch", expect.objectContaining({
        method: "POST",
        body: { contractVersion: "1", invitations: [{ playerName: "Player", playerId: "1234" }, { playerName: "Another", playerId: "5678" }] },
      }));
      expect(wrapper.text()).toContain("Player#1234");
      expect(wrapper.get('button[aria-label="复制 Player 的绑定口令"]').text()).toContain("复制口令");
      expect(wrapper.emitted("created")).toHaveLength(1);
    });

    it("blocks malformed and duplicate BattleTags before requesting invitations", async () => {
      adminApi.mockClear();
      const wrapper = await openBatch();
      await wrapper.find("textarea").setValue("Player#1234\nplayer#1234\ninvalid");

      expect(wrapper.text()).toContain("第 2 行重复");
      expect(wrapper.text()).toContain("第 3 行格式无效");
      expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
    });
  });
});
