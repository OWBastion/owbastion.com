import { clearNuxtData } from "#app";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicPlayerPage from "./[userId].vue";

const api = vi.hoisted(() => vi.fn());
mockNuxtImport("usePortalApi", () => () => api);
mockNuxtImport("useRoute", () => () => ({ params: { userId: "someone" }, query: {} }));

const profile = {
  contractVersion: "1",
  handle: "someone",
  player: { displayName: "Someone", equippedTitle: null },
  boards: { mastery: { rank: 7, score: 1200 }, achievement: null },
  titles: { general: [], map: [] },
  perMapXp: [],
  mapCount: 0,
};
const mountPage = async () => {
  const wrapper = await mountSuspended(PublicPlayerPage);
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  clearNuxtData();
  api.mockReset();
});

describe("public player page", () => {
  it("shows the player's name and handle for a public profile", async () => {
    api.mockResolvedValue(profile);
    const wrapper = await mountPage();
    expect(wrapper.find("h1").text()).toBe("Someone");
    expect(wrapper.text()).toContain("@someone");
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
  });

  it("treats a missing or non-public player as not found, not as an error", async () => {
    api.mockImplementation(async () => { throw Object.assign(new Error("missing"), { statusCode: 404 }); });
    const wrapper = await mountPage();
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
    expect(wrapper.find("[role=status]").exists()).toBe(true);
  });

  it("reports a failed read as an error that can be retried", async () => {
    api.mockImplementationOnce(async () => { throw Object.assign(new Error("down"), { statusCode: 503 }); });
    api.mockResolvedValue(profile);
    const wrapper = await mountPage();
    expect(wrapper.find("[role=alert]").exists()).toBe(true);

    await wrapper.find("[role=alert] button").trigger("click");
    await flushPromises();
    expect(wrapper.find("h1").text()).toBe("Someone");
  });
});
