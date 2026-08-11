import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MapsAdminPage from "./maps.vue";

const mapsPayload = {
  items: [{
    mapId: "map.samoa",
    mapName: "萨摩亚",
    gameVersion: "26.0713.1",
    difficultyRating: "T3",
    mechanics: ["动态掩体"],
    coverUrl: null as string | null,
    backgroundUrl: null as string | null,
  }],
};

const challengesPayload = {
  items: [
    {
      challengeId: "map.samoa.hell",
      family: "map" as const,
      gameplayRevisionId: "revision:map.samoa:initial",
      type: "map_completion" as const,
      kind: "difficulty_completion" as const,
      name: "地狱难度通关",
      mapId: "map.samoa",
      mapName: "萨摩亚",
      difficulty: "地狱",
      condition: "通关地狱",
      evidenceRule: "完整截图",
      submissionMode: "manual" as const,
      gameVersion: "26.0713.1",
      status: "active" as const,
      introducedVersion: "26.0713.1",
      retiredVersion: null,
    },
    {
      challengeId: "map.samoa.scheduled",
      family: "map" as const,
      gameplayRevisionId: "revision:map.samoa:initial",
      type: "map_completion" as const,
      kind: "difficulty_completion" as const,
      name: "计划开放挑战",
      mapId: "map.samoa",
      mapName: "萨摩亚",
      difficulty: "困难",
      condition: "通关困难",
      evidenceRule: "完整截图",
      submissionMode: "manual" as const,
      gameVersion: "26.0713.1",
      status: "scheduled" as const,
      introducedVersion: "26.0713.1",
      retiredVersion: null,
    },
  ],
};

const adminApi = vi.fn(async (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/maps") return mapsPayload;
  if (path === "/v1/achievements?type=map") return challengesPayload;
  if (path === "/v1/maps/map.samoa/metadata" && options?.method === "PUT") {
    return {
      ...mapsPayload.items[0],
      difficultyRating: options.body?.difficultyRating ?? mapsPayload.items[0].difficultyRating,
      mechanics: options.body?.mechanics ?? mapsPayload.items[0].mechanics,
      coverUrl: options.body?.coverUrl ?? null,
      backgroundUrl: options.body?.backgroundUrl ?? null,
    };
  }
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

const dialogStub = {
  props: ["open", "title"],
  template: '<div v-if="open" role="dialog" data-testid="map-dialog"><p data-testid="dialog-title">{{ title }}</p><slot name="body" /><div data-testid="dialog-footer"><slot name="footer" /></div></div>',
};

async function mountPage(): Promise<VueWrapper> {
  adminApi.mockClear();
  const wrapper = await mountSuspended(MapsAdminPage, {
    attachTo: document.body,
    global: {
      stubs: {
        AdminResponsiveDialog: dialogStub,
        StatusBadge: { props: ["label", "tone"], template: '<span class="status-badge" :class="`status-badge--${tone || \'default\'}`">{{ label }}</span>' },
        UForm: {
          props: ["state", "validate", "disabled"],
          emits: ["submit"],
          template: '<form id="map-metadata-editor" @submit.prevent="$emit(\'submit\', { data: state })"><slot /></form>',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

async function openDetail(wrapper: VueWrapper) {
  const viewButton = wrapper.findAll("button").find((button) => button.text() === "查看");
  expect(viewButton).toBeDefined();
  await viewButton!.trigger("click");
  await flushPromises();
  expect(wrapper.find('[data-testid="map-dialog"]').exists()).toBe(true);
}

describe("admin maps page", () => {
  it("renders the map table with neutral rating badges and opens editable map details", async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("T3");
    expect(wrapper.text()).toContain("动态掩体");
    expect(wrapper.find("table").text()).not.toContain("map.samoa");

    const ratingBadge = wrapper.findAll(".status-badge").find((node) => node.text() === "T3");
    expect(ratingBadge?.classes()).toContain("status-badge--default");
    expect(ratingBadge?.classes()).not.toContain("status-badge--success");

    await openDetail(wrapper);
    expect(wrapper.text()).toContain("地图难度评级");
    expect(wrapper.text()).toContain("挑战难度");
    expect(wrapper.text()).toContain("在成就与称号中管理");
    expect(wrapper.text()).toContain("未开放");
  });

  it("keeps scheduled challenges distinct from retired in the nested list", async () => {
    const wrapper = await mountPage();
    await openDetail(wrapper);
    expect(wrapper.text()).toContain("计划开放挑战");
    expect(wrapper.text()).toContain("未开放");
    expect(wrapper.text()).toContain("已开放");
    // Scheduled must not be collapsed into retired wording.
    const dialog = wrapper.get('[data-testid="map-dialog"]').text();
    expect(dialog).not.toMatch(/计划开放挑战[\s\S]{0,40}已下线/);
  });

  it("surfaces metadata save failures inside the dialog without clearing drafts", async () => {
    adminApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/v1/maps") return mapsPayload;
      if (path === "/v1/achievements?type=map") return challengesPayload;
      if (path === "/v1/maps/map.samoa/metadata" && options?.method === "PUT") throw Object.assign(new Error("save failed"), { data: { error: { message: "无法保存地图属性，请稍后重试。" } } });
      throw new Error(`Unexpected request: ${path}`);
    });
    const wrapper = await mountPage();
    await openDetail(wrapper);
    const coverInput = wrapper.findAll('input').find((input) => (input.element as HTMLInputElement).placeholder?.includes("https"));
    expect(coverInput).toBeDefined();
    await coverInput!.setValue("https://cdn.example.com/cover.webp");
    await wrapper.get("form#map-metadata-editor").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[data-testid="map-dialog"]').text()).toContain("无法保存地图属性");
    expect((coverInput!.element as HTMLInputElement).value).toBe("https://cdn.example.com/cover.webp");
  });

  it("exposes clear controls with accessible names for optional image fields", async () => {
    const wrapper = await mountPage();
    await openDetail(wrapper);
    const coverInput = wrapper.findAll("input").find((input) => (input.element as HTMLInputElement).placeholder?.includes("https"));
    expect(coverInput).toBeDefined();
    await coverInput!.setValue("https://cdn.example.com/cover.webp");
    await flushPromises();
    const clear = wrapper.findAll("button").find((button) => button.attributes("aria-label") === "清除封面地址");
    expect(clear).toBeDefined();
    await clear!.trigger("click");
    await flushPromises();
    expect((coverInput!.element as HTMLInputElement).value).toBe("");
  });
});
