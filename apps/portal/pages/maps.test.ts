import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import MapsPage from "./maps.vue";

const currentPlayer = ref<{ player: { playerId: string; playerName: string; bindingStatus: "bound"; isAdmin: boolean }; recentSubmissions: never[] } | null>(null);
const refreshPlayer = vi.fn(async () => currentPlayer.value);
const portalApi = vi.fn(async (path: string) => {
  if (path === "/v1/maps") return { items: [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0713.1", difficultyRating: "T3", mechanics: ["动态掩体"] }] };
  if (path === "/v1/challenges?family=map") return { items: [{ challengeId: "map.samoa.hell", family: "map", type: "map_completion", kind: "difficulty_completion", name: "地狱难度通关", mapId: "map.samoa", mapName: "萨摩亚", difficulty: "地狱", gameVersion: "26.0713.1", status: "active" }] };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player: currentPlayer, refresh: refreshPlayer }));
mockNuxtImport("usePortalApi", () => () => portalApi);

describe("maps page", () => {
  it("renders the public map directory for signed-out visitors", async () => {
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("登录后查看");
    expect(portalApi).toHaveBeenCalledWith("/v1/maps");
    expect(portalApi).toHaveBeenCalledWith("/v1/challenges?family=map");
  });

  it("keeps the page interactive before a map is selected", async () => {
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    expect(wrapper.find("main.maps-page").exists()).toBe(true);
    expect(document.querySelector('[data-vaul-overlay][data-state="open"]')).toBeNull();
  });

  it("opens the mobile detail drawer for the selected map", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] };
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    await wrapper.get(".map-card").trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("最快通关");
    expect(document.body.textContent).toContain("暂无记录");
  });

  it("shows the factual error state when either public catalog request fails", async () => {
    portalApi.mockImplementationOnce(async () => { throw new Error("maps unavailable"); });
    portalApi.mockImplementationOnce(async () => ({ items: [] }));
    currentPlayer.value = null;
    const wrapper = await mountSuspended(MapsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("无法读取地图目录");
  });
});
