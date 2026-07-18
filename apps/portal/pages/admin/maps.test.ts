import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MapsAdminPage from "./maps.vue";

const adminApi = vi.fn(async (path: string) => {
  if (path === "/v1/maps") return { items: [{ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0713.1", difficultyRating: "T3", mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null }] };
  if (path === "/v1/achievements?type=map") return { items: [{ challengeId: "map.samoa.hell", family: "map", type: "map_completion", kind: "difficulty_completion", name: "地狱难度通关", mapId: "map.samoa", mapName: "萨摩亚", difficulty: "地狱", gameVersion: "26.0713.1", status: "active", introducedVersion: "26.0713.1", retiredVersion: null }] };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin maps page", () => {
  it("renders the map table and opens editable map details", async () => {
    const wrapper = await mountSuspended(MapsAdminPage);
    await flushPromises();
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("T3");
    expect(wrapper.text()).toContain("动态掩体");
    expect(wrapper.find("table").text()).not.toContain("map.samoa");
    const viewButton = wrapper.findAll("button").find((button) => button.text() === "查看");
    expect(viewButton).toBeDefined();
    await viewButton!.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("地图难度评级");
    expect(document.body.textContent).toContain("挑战难度");
  });
});
