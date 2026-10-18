import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PlayerPage from "./[userId].vue";

const portalApi = vi.fn();
mockNuxtImport("usePortalApi", () => () => portalApi);
mockNuxtImport("useRoute", () => () => ({ params: { userId: "堡主一号" }, path: "/u/堡主一号", query: {} }));

const stubs = { LeaderboardPlayerDetail: { template: '<div data-detail="1" />' }, UIcon: true };

describe("public player page", () => {
  it("reads the profile by the URL handle and renders the display name", async () => {
    portalApi.mockResolvedValueOnce({ handle: "堡主一号", contractVersion: "1", publicProfile: true, player: { displayName: "Player", equippedTitle: null }, boards: { mastery: null, achievement: null } });
    const wrapper = await mountSuspended(PlayerPage, { global: { stubs } });
    await flushPromises();
    expect(portalApi).toHaveBeenCalledWith(`/v1/public/players/${encodeURIComponent("堡主一号")}`);
    expect(wrapper.text()).toContain("Player");
    expect(wrapper.find('[data-detail="1"]').exists()).toBe(true);
  });
});
