import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminPlayerList from "~/components/admin/AdminPlayerList.vue";

const adminApi = vi.fn((path: string) => {
  if (path.startsWith("/v1/player-accounts?")) return Promise.resolve({ items: [{ playerAccountId: "player-1", playerName: "他又", playerId: "51705", bindingCount: 1, pendingSubmissionCount: 3, status: "active" }, { playerAccountId: "player-2", playerName: "封禁者", playerId: "2", bindingCount: 0, pendingSubmissionCount: 0, status: "banned" }], total: 2, hasMore: false });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin player list", () => {
  it("links each player to its detail and surfaces pending reviews and bans", async () => {
    const wrapper = await mountSuspended(AdminPlayerList, { props: { selectedId: "player-1" }, global: { stubs: { StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" } } } });
    await flushPromises();
    expect(wrapper.find('input[aria-label="搜索玩家"]').exists()).toBe(true);
    const first = wrapper.get('a[href="/admin/players/player-1"]');
    expect(first.text()).toContain("他又");
    expect(first.text()).toContain("待审 3");
    expect(first.attributes("aria-current")).toBe("page");
    expect(wrapper.get('a[href="/admin/players/player-2"]').text()).toContain("已封禁");
  });

  it("filters by status through the chips", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AdminPlayerList);
    await flushPromises();
    await wrapper.findAll(".chip").find((chip) => chip.text() === "已封禁")!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("status=banned"));
  });
});
