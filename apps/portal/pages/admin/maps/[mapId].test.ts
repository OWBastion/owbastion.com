import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import MapEditorPage from "./[mapId].vue";

const adminApi = vi.fn(async (path: string) => {
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
          AdminResponsiveDialog: { template: "<div />" },
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
});
