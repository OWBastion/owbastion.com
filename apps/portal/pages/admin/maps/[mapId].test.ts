import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import MapEditorPage from "./[mapId].vue";

const resetRequests: Array<Record<string, unknown>> = [];
const adminApi = vi.fn(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/maps/map.samoa/editor") {
    return {
      contractVersion: "1" as const,
      map: {
        mapId: "map.samoa",
        mapName: "萨摩亚",
        gameVersion: "2026.07.15",
        difficultyRating: "T3" as const,
        mechanics: ["动态掩体"],
        coverUrl: null,
        backgroundUrl: null,
      },
      revisions: [{
        revisionId: "revision:map.samoa:initial",
        mapId: "map.samoa",
        lifecycle: "default" as const,
        mapVariant: null,
        copiedFromRevisionId: null,
        resetReason: null,
        gameVersion: "2026.07.15",
        spatialConfig: null,
        isDefault: true,
        isSelectable: false,
        challengeAssignments: [],
        createdAt: 1,
        updatedAt: 1,
      }],
      challengeCatalog: [],
      audit: [],
    };
  }
  if (path === "/v1/maps/map.samoa/revisions" && options?.method === "POST") {
    resetRequests.push(options.body ?? {});
    return {
      revisionId: "revision:map.samoa:rework",
      mapId: "map.samoa",
      lifecycle: "preparing" as const,
      mapVariant: null,
      copiedFromRevisionId: "revision:map.samoa:initial",
      resetReason: options.body?.resetReason ?? null,
      gameVersion: "2026.07.15",
      spatialConfig: null,
      isDefault: false,
      isSelectable: false,
      challengeAssignments: [],
      createdAt: 2,
      updatedAt: 2,
    };
  }
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: vi.fn() }));
mockNuxtImport("useCurrentPlayer", () => () => ({
  player: ref({ player: { isAdmin: true } }),
  status: ref("authenticated"),
  refresh: vi.fn(),
}));

describe("admin map editor page", () => {
  it("loads the editor for the dynamic map route", async () => {
    const wrapper = await mountSuspended(MapEditorPage, {
      route: "/admin/maps/map.samoa",
      global: {
        stubs: {
          AdminMapRevisionList: { template: "<div>Gameplay revisions</div>" },
          AdminMapRevisionEditor: { template: "<div>编辑当前边界</div>" },
          AdminResponsiveDialog: { props: ["open"], template: "<div v-if=\"open\"><slot name=\"body\" /><slot name=\"footer\" /></div>" },
          StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        },
      },
    });
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/maps/map.samoa/editor");
    expect(wrapper.text()).toContain("地图编辑器");
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("编辑当前边界");
    expect(wrapper.text()).not.toContain("地图管理");
  });

  it("creates a reset revision without a reason and shows a source-derived readonly game version", async () => {
    resetRequests.length = 0;
    const wrapper = await mountSuspended(MapEditorPage, {
      route: "/admin/maps/map.samoa",
      global: {
        stubs: {
          AdminMapRevisionList: { template: "<div>Gameplay revisions</div>" },
          AdminMapRevisionEditor: { template: "<div>编辑当前边界</div>" },
          AdminResponsiveDialog: { props: ["open"], template: "<div v-if=\"open\"><slot name=\"body\" /><slot name=\"footer\" /></div>" },
          StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        },
      },
    });
    await flushPromises();
    const openReset = wrapper.findAll("button").find((button) => button.text().includes("重置 / 重做"));
    await openReset!.trigger("click");
    await nextTick();

    expect(wrapper.get("textarea[placeholder^='例如：地图几何']").attributes("required")).toBeUndefined();
    const targetVersion = wrapper.get("input[readonly]");
    expect((targetVersion.element as HTMLInputElement).value).toBe("2026.07.15");
    expect(wrapper.findAll("button").find((button) => button.text().includes("创建准备中版本修订"))?.attributes("disabled")).toBeUndefined();

    await wrapper.get("#map-reset-form").trigger("submit");
    await flushPromises();
    expect(resetRequests).toEqual([{
      contractVersion: "1",
      sourceRevisionId: "revision:map.samoa:initial",
      resetReason: null,
      mapVariant: null,
      copyConfiguration: true,
    }]);
  });
});
