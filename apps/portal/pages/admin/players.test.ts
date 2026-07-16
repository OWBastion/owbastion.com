import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PlayersPage from "./players.vue";

const adminApi = vi.fn((path: string) => {
  if (path.startsWith("/v1/player-accounts?")) return Promise.resolve({ items: [{ playerAccountId: "player-1", playerName: "他又", playerId: "51705", bindingCount: 1, status: "active" }], hasMore: false });
  if (path === "/v1/player-accounts/player-1") return Promise.resolve({ playerAccountId: "player-1", playerName: "他又", playerId: "51705", status: "active", updatedAt: 0, bindings: [], recentSubmissions: [] });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin players page", () => {
  it("opens the player detail sheet and restores focus after Escape", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(PlayersPage, { attachTo: document.body, global: { stubs: { StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" } } } });
    await flushPromises();
    const trigger = wrapper.get(".admin-table .text-button");
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger("click");
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(document.activeElement).toBe(trigger.element);
  });
});
