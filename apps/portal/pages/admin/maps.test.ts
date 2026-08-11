import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MapsAdminPage from "./maps.vue";

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
const adminApi = vi.fn(async (path: string) => {
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
    const editorLink = wrapper.findAll("a").find((link) => link.text() === "打开编辑器");
    expect(editorLink).toBeDefined();
    expect(editorLink!.attributes("href")).toBe("/admin/maps/map.samoa");
    expect(adminApi).toHaveBeenCalledWith("/v1/maps");
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements?type=map");
    expect(adminApi.mock.calls.some(([path]) => path === "/v1/maps/map.samoa/metadata")).toBe(false);
  });
});
