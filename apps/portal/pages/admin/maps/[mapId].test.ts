import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import MapEditorPage from "./[mapId].vue";
import { formatCurrentGameVersion } from "~/utils/game-version";

const pageStubs = {
  AdminSpatialConfigInput: { props: ["modelValue"], template: "<div data-testid=\"spatial-input\" />" },
  AdminResponsiveDialog: { props: ["open"], template: "<div v-if=\"open\"><slot name=\"body\" /><slot name=\"footer\" /></div>" },
  USlideover: { props: ["open"], template: "<div v-if=\"open\"><slot name=\"body\" /></div>" },
  StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
};

const saveRequests: Array<Record<string, unknown>> = [];
const resetRequests: Array<Record<string, unknown>> = [];
const catalog = [
  { challengeFamily: "map_title_rule", challengeId: "rule.conqueror", label: "征服者", kind: "conqueror", titleKey: "CONQUEROR", status: "active", gameVersion: "2026.07.15" },
  { challengeFamily: "map_challenge", challengeId: "map.samoa.conqueror", label: "征服者挑战", kind: "difficulty_completion", titleKey: "CONQUEROR", status: "active", gameVersion: "2026.07.15" },
];
const revision = (overrides: Record<string, unknown> = {}) => ({
  revisionId: "revision:map.samoa:initial", mapId: "map.samoa", lifecycle: "default" as const, mapVariant: null, mode: null, copiedFromRevisionId: null, resetReason: null,
  gameVersion: "2026.07.15", spatialConfig: null, isDefault: true, isSelectable: false, challengeAssignments: [], createdAt: 1, updatedAt: 1, ...overrides,
});
const adminApi = vi.fn(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/maps/map.samoa/editor") {
    return {
      contractVersion: "1" as const,
      map: { mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "2026.08.12", difficultyRating: "T3" as const, mechanics: ["动态掩体"], coverUrl: null, backgroundUrl: null },
      revisions: [revision()],
      challengeCatalog: catalog,
      audit: [],
    };
  }
  if (path === "/v1/maps/map.samoa/revisions" && options?.method === "POST") {
    resetRequests.push(options.body ?? {});
    return revision({ revisionId: "revision:map.samoa:rework", lifecycle: "preparing", isDefault: false, copiedFromRevisionId: "revision:map.samoa:initial", gameVersion: "2026.08.12" });
  }
  if (path === "/v1/maps/map.samoa/revisions/revision%3Amap.samoa%3Ainitial" && options?.method === "PUT") {
    saveRequests.push(options.body ?? {});
    return revision();
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

const mountPage = async () => {
  const wrapper = await mountSuspended(MapEditorPage, { route: "/admin/maps/map.samoa", global: { stubs: pageStubs } });
  await flushPromises();
  return wrapper;
};
const button = (wrapper: Awaited<ReturnType<typeof mountPage>>, label: string) => wrapper.findAll("button").find((item) => item.text().includes(label));

describe("admin map editor page", () => {
  it("shows revisions, readiness, spatial and honor sections on one page", async () => {
    const wrapper = await mountPage();

    expect(adminApi).toHaveBeenCalledWith("/v1/maps/map.samoa/editor");
    expect(wrapper.text()).toContain("萨摩亚 · 地图编辑器");
    expect(wrapper.get('[role="tablist"]').text()).toContain("标准版");
    expect(wrapper.get('[role="tablist"]').text()).toContain("正式");
    expect(wrapper.text()).toContain("还没有粘贴点位");
    expect(wrapper.find('[data-testid="spatial-input"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("成就与称号");
    expect(wrapper.text()).toContain("征服者");
    expect(wrapper.text()).not.toContain("JSON");
  });

  it("keeps map metadata out of the editing flow until it is asked for", async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).not.toContain("保存地图资料");
    await button(wrapper, "地图资料")!.trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("保存地图资料");
  });

  it("stages honor changes as a draft and saves the revision in one request", async () => {
    saveRequests.length = 0;
    const wrapper = await mountPage();

    expect(wrapper.find(".draft-bar--visible").exists()).toBe(false);
    await wrapper.get('button[role="switch"]').trigger("click");
    await nextTick();
    expect(wrapper.get(".draft-bar--visible").text()).toContain("有未保存的修改");
    expect(wrapper.text()).toContain("已关联 2 项");

    await button(wrapper, "保存")!.trigger("click");
    await flushPromises();
    expect(saveRequests).toHaveLength(1);
    expect(saveRequests[0]).toMatchObject({ contractVersion: "1", lifecycle: "default", mapVariant: null, spatialConfig: null });
    const assignments = saveRequests[0]!.challengeAssignments as Array<{ challengeId: string; enabled: boolean }>;
    expect(assignments.map((item) => [item.challengeId, item.enabled]).sort()).toEqual([["map.samoa.conqueror", true], ["rule.conqueror", true]]);
  });

  it("creates a reworked revision from the current default with today's version", async () => {
    resetRequests.length = 0;
    const wrapper = await mountPage();
    await button(wrapper, "新建修订")!.trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("限时 / 活动版本");
    expect(wrapper.text()).toContain("地图重置 / 重做");
    expect(wrapper.findAll("input").some((input) => (input.element as HTMLInputElement).value === formatCurrentGameVersion())).toBe(true);

    await wrapper.get("#map-new-revision-form").trigger("submit");
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
