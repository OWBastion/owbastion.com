import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import MapEditorPage from "./[mapId].vue";
import { formatCurrentGameVersion } from "~/utils/game-version";

const pageStubs = {
  AdminMapRevisionList: { template: "<div>版本修订</div>" },
  AdminMapRevisionEditor: { template: "<div>编辑当前边界</div>" },
  AdminResponsiveDialog: { props: ["open"], template: "<div v-if=\"open\"><slot name=\"body\" /><slot name=\"footer\" /></div>" },
  StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
  UTabs: {
    props: ["modelValue", "items"],
    emits: ["update:modelValue"],
    template: '<div><button v-for="item in items" :key="item.value" type="button" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>',
  },
};

const resetRequests: Array<Record<string, unknown>> = [];
const adminApi = vi.fn(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/maps/map.samoa/editor") {
    return {
      contractVersion: "1" as const,
      map: {
        mapId: "map.samoa",
        mapName: "萨摩亚",
        gameVersion: "2026.08.12",
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
      gameVersion: "2026.08.12",
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
      global: { stubs: pageStubs },
    });
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/maps/map.samoa/editor");
    expect(wrapper.text()).toContain("地图编辑器");
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("编辑当前边界");
    expect(wrapper.text()).toContain("修订");
    expect(wrapper.text()).toContain("属性");
    expect(wrapper.text()).toContain("记录");
    expect(wrapper.text()).not.toContain("稳定地图身份");
    expect(wrapper.text()).not.toContain("普通保存");
    expect(wrapper.text()).not.toContain("可追溯变更");
    expect(wrapper.text()).not.toContain("地图管理");
    expect(wrapper.text()).toContain("版本修订");
    expect(wrapper.text()).not.toContain("Gameplay revisions");
  });

  it("keeps map attributes off the default revision workspace", async () => {
    const wrapper = await mountSuspended(MapEditorPage, {
      route: "/admin/maps/map.samoa",
      global: { stubs: pageStubs },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("保存地图属性");
    const attributesTab = wrapper.findAll("button").find((button) => button.text() === "属性");
    expect(attributesTab).toBeDefined();
    await attributesTab!.trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("保存地图属性");
    expect(wrapper.text()).not.toContain("编辑当前边界");
  });

  it("defaults a reset revision to today's version and lets the administrator change it", async () => {
    resetRequests.length = 0;
    const wrapper = await mountSuspended(MapEditorPage, {
      route: "/admin/maps/map.samoa",
      global: { stubs: pageStubs },
    });
    await flushPromises();
    const openReset = wrapper.findAll("button").find((button) => button.text().includes("新建修订"));
    await openReset!.trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("来源版本修订");
    expect(wrapper.text()).toContain("复制空间配置和挑战分配");
    expect(wrapper.text()).not.toContain("来源 revision");
    expect(wrapper.text()).not.toContain("challenge assignments");
    expect(wrapper.get("#map-reset-form textarea").attributes("required")).toBeUndefined();
    const targetVersion = wrapper.findAll("input").find((input) => (input.element as HTMLInputElement).value === formatCurrentGameVersion());
    expect(targetVersion).toBeDefined();
    expect(wrapper.findAll("button").find((button) => button.text().includes("创建修订"))?.attributes("disabled")).toBeUndefined();

    await wrapper.get("#map-reset-form").trigger("submit");
    await flushPromises();
    expect(resetRequests).toEqual([{
      contractVersion: "1",
      sourceRevisionId: "revision:map.samoa:initial",
      resetReason: null,
      gameVersion: formatCurrentGameVersion(),
      mapVariant: null,
      copyConfiguration: true,
    }]);
  });
});
