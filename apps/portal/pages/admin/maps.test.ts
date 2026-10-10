import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MapsAdminPage from "./maps/index.vue";

const mapsPayload = {
  items: [{
    mapId: "map.samoa",
    mapName: "萨摩亚",
    gameVersion: "26.0713.1",
    difficultyRating: "T3" as const,
    mechanics: ["动态掩体"],
    coverUrl: null as string | null,
    backgroundUrl: null as string | null,
  }],
};
const navigateTo = vi.hoisted(() => vi.fn());
mockNuxtImport("navigateTo", () => navigateTo);
const adminApi = vi.fn(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/maps" && options?.method === "POST") return { mapId: "map.new_1", mapName: options.body?.mapName, gameVersion: "26.1003.1" };
  if (path === "/v1/maps") return mapsPayload;
  if (path === "/v1/achievements?type=map") return { items: [{ mapId: "map.samoa" }] };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

async function mountPage(): Promise<VueWrapper> {
  adminApi.mockClear();
  const wrapper = await mountSuspended(MapsAdminPage, {
    attachTo: document.body,
    global: {
      stubs: {
        StatusBadge: { props: ["label", "tone"], template: '<span class="status-badge" :class="`status-badge--${tone || \'default\'}`">{{ label }}</span>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("admin maps directory", () => {
  it("opens the dedicated map editor instead of an inline metadata dialog", async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("T3");
    expect(wrapper.text()).toContain("动态掩体");
    expect(wrapper.find("table").text()).not.toContain("map.samoa");
    const editorLink = wrapper.findAll("a").find((link) => link.text() === "编辑");
    expect(editorLink).toBeDefined();
    expect(editorLink!.attributes("href")).toBe("/admin/maps/map.samoa");
    expect(adminApi).toHaveBeenCalledWith("/v1/maps");
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements?type=map");
    expect(adminApi.mock.calls.some(([path]) => path === "/v1/maps/map.samoa/metadata")).toBe(false);
  });

  it("adds a map by name only and opens its editor", async () => {
    const wrapper = await mountPage();
    await wrapper.findAll("button").find((button) => button.text() === "新增地图")!.trigger("click");
    await flushPromises();
    const name = document.body.querySelector<HTMLInputElement>("form#map-create-form input")!;
    name.value = "新地图";
    name.dispatchEvent(new Event("input"));
    document.body.querySelector<HTMLFormElement>("form#map-create-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/maps", expect.objectContaining({ method: "POST", body: { contractVersion: "1", mapName: "新地图" } }));
    expect(navigateTo).toHaveBeenCalledWith("/admin/maps/map.new_1");
    wrapper.unmount();
  });
});
