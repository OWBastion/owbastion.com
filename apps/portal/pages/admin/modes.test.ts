import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ModesPage from "./modes.vue";

const adminApi = vi.fn((path: string, _options?: { method?: string; body?: unknown }) => {
  if (path === "/v1/standalone-modes") return Promise.resolve({ items: [{ mode: "2026镜中回响", mapIds: ["map.rialto"], eventPools: ["2026周年"], eventWeightTotal: 69.5, createdAt: 1, updatedAt: 1 }] });
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map.rialto", mapName: "里阿尔托" }, { mapId: "map.route66", mapName: "66号公路" }] });
  if (path === "/v1/event-versions") return Promise.resolve({ items: [{ gameVersion: "2026周年", mode: "2026镜中回响", eventCount: 7 }, { gameVersion: "5.0", mode: null, eventCount: 16 }] });
  if (path.startsWith("/v1/standalone-modes/")) return Promise.resolve({});
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: vi.fn() }));
const dialogStub = { AdminResponsiveDialog: { props: ["open", "title"], template: '<div v-if="open" role="dialog" :aria-label="title"><slot name="body" /><slot name="footer" /></div>' } };

describe("admin standalone modes page", () => {
  it("lists each mode's maps, pools, and weight total and saves an edit in one request", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ModesPage, { global: { stubs: dialogStub } });
    await flushPromises();
    expect(wrapper.text()).toContain("2026镜中回响");
    expect(wrapper.text()).toContain("1 张地图：里阿尔托");
    expect(wrapper.text()).toContain("事件总权重：69.5");

    await wrapper.get('button[aria-label="编辑 2026镜中回响"]').trigger("click");
    const selects = wrapper.get('[role="dialog"]').findAllComponents({ name: "USelect" });
    selects[0]!.vm.$emit("update:modelValue", ["map.rialto", "map.route66"]);
    await wrapper.get("#standalone-mode-form").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/standalone-modes/2026%E9%95%9C%E4%B8%AD%E5%9B%9E%E5%93%8D", expect.objectContaining({
      method: "PUT",
      body: { contractVersion: "1", mapIds: ["map.rialto", "map.route66"], eventPools: ["2026周年"], eventWeightTotal: 69.5 },
    }));
  });
});
