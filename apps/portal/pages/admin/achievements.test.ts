import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AchievementAdminPage from "./achievements.vue";
import AdminDateTimePicker from "../../components/admin/AdminDateTimePicker.vue";

const title = { challengeId: "title-1", family: "achievement", type: "title_achievement", titleKey: "FLAWLESS", titleName: "守望先锋", icon: "trophy", iconUrl: null, category: "战绩", categoryOverride: null, condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", status: "active", gameVersion: "3.1.0", introducedVersion: "3.1.0", retiredVersion: null };
const secondTitle = { ...title, challengeId: "title-2", titleName: "游戏先锋" };
const catalogTitle = { challengeId: "title.INTERNAL", family: "title_catalog", type: "title_catalog", titleKey: "INTERNAL", titleName: "内部称号", icon: "wrench", iconUrl: null, category: "开发保留", condition: "开发/管理用途。", availability: "active", scope: "global", displayKind: "fixed", status: "active", gameVersion: "3.1.0", hasChallenge: false };
const map = { challengeId: "map-1", family: "map", type: "map_completion", name: "国王大道挑战", mapId: "map.kings-row", mapName: "国王大道", difficulty: "困难", condition: "完成国王大道挑战。", evidenceRule: "完整截图", submissionMode: "manual", status: "active", gameVersion: "3.0.0", introducedVersion: "3.0.0", retiredVersion: null };
const secondMap = { ...map, challengeId: "map-2", name: "国王大道专家挑战" };
const duplicateMap = { ...map, mapId: "map.route-66", mapName: "66号公路", name: "66号公路挑战" };
const mapRule = { ruleId: "rule.conqueror", titleKey: "CONQUEROR", titleName: "征服者", kind: "conqueror", condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual", displayKind: "map_name_suffix", slot: "conqueror", defaultScope: "all_active", status: "active", introducedVersion: "3.1.0", retiredVersion: null };
const mapInheritance = { mapId: "map.kings-row", rule: mapRule, projected: true, source: "map_title_rule", effective: { condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual", slot: "conqueror" }, exception: null };
const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/achievements") return Promise.resolve({ items: [{ ...title }, { ...secondTitle }, { ...catalogTitle }, { ...map }, { ...secondMap }, { ...duplicateMap }] });
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map.kings-row", mapName: "国王大道" }, { mapId: "map.route-66", mapName: "66号公路" }] });
  if (path === "/v1/map-title-rules") return Promise.resolve({ items: [mapRule] });
  if (path === "/v1/map-title-rules/rule.conqueror" && options?.method === "PUT") return Promise.resolve({ ...mapRule, ...options.body });
  if (path === "/v1/maps/map.kings-row/map-title-inheritance") return Promise.resolve({ items: [mapInheritance] });
  if (path === "/v1/maps/map.route-66/map-title-inheritance") return Promise.resolve({ items: [] });
  if (path === "/v1/maps/map.kings-row/map-title-rules/rule.conqueror/exception" && options?.method === "PUT") return Promise.resolve();
  if (path === "/v1/achievements?status=sunsetting") return Promise.resolve({ items: [{ ...title, status: "sunsetting", retiredVersion: "26.0713.1" }] });
  if (path === "/v1/achievements/title-1" && options?.method === "PUT") return Promise.resolve({ ...title, ...options.body });
  if (path === "/v1/achievements/title-2" && options?.method === "PUT") return Promise.resolve({ ...secondTitle, ...options.body });
  if (path === "/v1/achievements/map-1" && options?.method === "PUT") return Promise.resolve({ ...map, ...options.body });
  if (path === "/v1/achievements/map-2" && options?.method === "PUT") return Promise.resolve({ ...secondMap, ...options.body });
  if (path === "/v1/titles/INTERNAL" && options?.method === "PUT") return Promise.resolve();
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);
const mountedWrappers: VueWrapper[] = [];

async function mountPage(): Promise<VueWrapper> {
  adminApi.mockClear();
  const wrapper = await mountSuspended(AchievementAdminPage, {
    attachTo: document.body,
    global: {
      stubs: {
        NuxtLink: { template: "<a><slot /></a>" },
        StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        UModal: { props: ["open"], emits: ["update:open"], template: '<div v-if="open" role="dialog"><slot name="body" /><slot name="footer" /></div>' },
        UPopover: { props: ["open"], emits: ["update:open"], template: '<div><slot /><slot name="content" /></div>' },
        UCard: { template: "<div><slot /></div>" },
        UTabs: {
          props: ["modelValue", "items"],
          emits: ["update:modelValue"],
          template: '<div><button v-for="item in items" :key="item.value" type="button" :aria-label="item.label" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button><slot :name="modelValue" /></div>',
        },
        USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
      },
    },
  });
  await flushPromises();
  mountedWrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
});

describe("achievement admin page", () => {
  it("opens the new achievement form after loading map choices", async () => {
    const wrapper = await mountPage();
    await wrapper.findAll("button").find((button) => button.text() === "新建挑战")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("新建挑战");
    expect(wrapper.text()).toContain("全部地图");
    wrapper.unmount();
  });

  it("uses an empty map selection for all-map challenges", async () => {
    const wrapper = await mountPage();
    await wrapper.findAll("button").find((button) => button.text() === "新建挑战")!.trigger("click");
    await flushPromises();
    const form = wrapper.get("form#achievement-create-form");
    await form.findAll("select")[1]!.setValue("map");
    expect(form.text()).toContain("指定地图");
    expect(form.text()).toContain("留空作用于全部有效地图");
    wrapper.unmount();
  });

  it("renders grouped achievements in one active tab at a time", async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("通用成就");
    expect(wrapper.find(".admin-table [aria-label='筛选成就状态']").exists()).toBe(true);
    expect(wrapper.find(".admin-workspace__toolbar").exists()).toBe(false);
    expect(wrapper.text()).toContain("战绩");
    expect(wrapper.text()).not.toContain("内部称号");
    expect(wrapper.text()).toContain("未开放");
    expect(wrapper.text()).not.toContain("开发保留");
    expect(wrapper.text()).not.toContain("国王大道");
    expect(wrapper.find(".portal-side-panel").exists()).toBe(false);
    expect(wrapper.findAll('button[aria-label="编辑规则"]')).toHaveLength(2);
    expect(wrapper.findAll('button[aria-label="计划下线"]')).toHaveLength(2);
    expect(wrapper.findAll('button[aria-label="结束挑战"]')).toHaveLength(2);
    expect(wrapper.findAll("button").some((button) => button.text() === "管理")).toBe(false);

    expect(wrapper.findAll('td[rowspan="2"]')).toHaveLength(1);
    expect(wrapper.find('td[rowspan="2"]').text()).toBe("战绩");
    expect(wrapper.findAll("td.hidden")).toHaveLength(1);

    await wrapper.get('button[aria-label="地图成就"]').trigger("click");
    await flushPromises();
    await wrapper.get('button[aria-label="按地图查看"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("国王大道");
    expect(wrapper.text()).toContain("征服者");
    expect(wrapper.text()).not.toContain("内部称号");

    await wrapper.get('button[aria-label="称号目录"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("内部称号");
    expect(wrapper.text()).toContain("开发保留");
  });

  it("opens status editing for catalog titles regardless of their lifecycle status", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="称号目录"]').trigger("click");
    await flushPromises();
    await wrapper.get('button[aria-label="编辑状态"]').trigger("click");
    await flushPromises();
    expect(wrapper.find("form.editor").exists()).toBe(true);
    expect(wrapper.find("form.editor").text()).toContain("称号标签");
    expect(wrapper.findAll("textarea")).toHaveLength(0);
    expect(wrapper.findAllComponents(AdminDateTimePicker)).toHaveLength(0);
    await wrapper.get("form.editor").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/titles/INTERNAL", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ contractVersion: "1", status: "active", label: "内部称号", icon: "wrench", category: "开发保留", scope: "global", displayKind: "fixed", color: null }) }));
  });

  it("keeps the complete editor visible while scheduling an achievement", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="编辑规则"]').trigger("click");
    const form = wrapper.get("form.editor");
    await form.findAll("select")[1]!.setValue("scheduled");
    const pickers = wrapper.findAllComponents(AdminDateTimePicker);
    await pickers[0]!.vm.$emit("update:modelValue", new Date("2030-01-01T00:00:00").getTime());
    await pickers[1]!.vm.$emit("update:modelValue", new Date("2030-01-02T00:00:00").getTime());
    await form.trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ status: "scheduled", condition: "完成挑战", evidenceRule: "完整截图", startsAt: expect.any(Number), endsAt: expect.any(Number) }) }));
  });

  it("saves expanded title rules and clears the category override", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="编辑规则"]').trigger("click");
    await flushPromises();
    const textareas = wrapper.findAll("textarea");
    await textareas[0].setValue("完成更新后的挑战");
    const category = wrapper.find('input[placeholder="战绩"]');
    await category.setValue("");
    await wrapper.get("form.editor").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ condition: "完成更新后的挑战", categoryOverride: null }) }));
  });

  it("saves a CDN icon URL and keeps file upload collapsed", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="编辑规则"]').trigger("click");
    await flushPromises();
    const iconUrl = wrapper.get('input[placeholder="https://cdn.example.com/icon.webp"]');
    await iconUrl.setValue("https://cdn.example.com/flawless.webp");
    expect(wrapper.get("details.icon-upload-option").attributes("open")).toBeUndefined();
    await wrapper.get("form.editor").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ iconUrl: "https://cdn.example.com/flawless.webp" }) }));
  });

  it("plans a sunset in a temporary Nuxt UI popover", async () => {
    const wrapper = await mountPage();
    const planButton = wrapper.get('button[aria-label="计划下线"]');
    await planButton.trigger("click");
    const form = wrapper.find("form.plan-popover");
    await form.find('input[placeholder="例如 26.0713.1"]').setValue("26.0713.1");
    await form.trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/title-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ status: "sunsetting", retiredVersion: "26.0713.1" }) }));
  });

  it("routes a genuine map challenge to the unified editor", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="地图成就"]').trigger("click");
    await flushPromises();
    await wrapper.get('button[aria-label="按地图查看"]').trigger("click");
    await flushPromises();
    const mapRow = wrapper.findAll("tr").find((row) => row.text().includes("国王大道挑战") && !row.text().includes("专家"))!;
    await mapRow.get("button").trigger("click");
    expect(wrapper.text()).toContain("编辑规则");
    expect(adminApi.mock.calls.some(([path, options]) => path === "/v1/achievements/map-1" && options?.method === "PUT")).toBe(false);
  });

  it("saves map rules and exceptions from the unified workspace", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="地图成就"]').trigger("click");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "编辑规则")!.trigger("click");
    await wrapper.get("form#map-title-rule-editor").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/map-title-rules/rule.conqueror", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ titleKey: "CONQUEROR", kind: "conqueror", defaultScope: "all_active" }) }));

    await wrapper.get('button[aria-label="按地图查看"]').trigger("click");
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "编辑例外")!.trigger("click");
    await wrapper.get("form#map-exception-editor").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/maps/map.kings-row/map-title-rules/rule.conqueror/exception", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ contractVersion: "1", enabled: true }) }));
  });

  it("keeps duplicate map challenge IDs isolated by map identity", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="地图成就"]').trigger("click");
    await flushPromises();
    await wrapper.get('button[aria-label="按地图查看"]').trigger("click");
    await flushPromises();
    await wrapper.get('select[aria-label="选择地图"]').setValue("map.route-66");
    await flushPromises();
    const mapRow = wrapper.findAll("tr").find((row) => row.text().includes("66号公路挑战"))!;
    await mapRow.findAll("button").find((button) => button.text() === "编辑挑战")!.trigger("click");
    expect((wrapper.get('input[maxlength="256"]').element as HTMLInputElement).value).toBe("66号公路挑战");
  });

  it("saves expanded map challenge rules", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="地图成就"]').trigger("click");
    await flushPromises();
    await wrapper.get('button[aria-label="按地图查看"]').trigger("click");
    await flushPromises();
    const mapRow = wrapper.findAll("tr").find((row) => row.text().includes("国王大道挑战") && !row.text().includes("专家"))!;
    await mapRow.findAll("button").find((button) => button.text() === "编辑挑战")!.trigger("click");
    const form = wrapper.get("form.editor");
    await form.find('input[maxlength="256"]').setValue("新的地图挑战");
    await form.findAll("textarea")[0]!.setValue("完成更新后的地图挑战");
    await form.trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/map-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ family: "map", name: "新的地图挑战", condition: "完成更新后的地图挑战", evidenceRule: "完整截图", submissionMode: "manual" }) }));
  });

  it("does not write when the end confirmation is cancelled", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="结束挑战"]').trigger("click");
    await flushPromises();
    const requestsBeforeCancel = adminApi.mock.calls.length;
    await wrapper.find('[role="dialog"] button').trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledTimes(requestsBeforeCancel);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("updates catalog-only title availability without creating a challenge", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[aria-label="称号目录"]').trigger("click");
    await flushPromises();
    const endButton = wrapper.get('button[aria-label="下线称号"]');
    await endButton.trigger("click");
    await flushPromises();
    await (document.body.querySelector('[role="dialog"] form') as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/titles/INTERNAL", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ contractVersion: "1", status: "retired", label: "内部称号", icon: "wrench", category: "开发保留" }) }));
    // A-04 — the row updates in place: the status badge flips to 已下线 (with the
    // row-update flash) and the catalog list is not re-fetched, so the page does
    // not flash through a full reload.
    expect(adminApi.mock.calls.filter(([path]) => path === "/v1/achievements").length).toBe(1);
    const flashed = wrapper.findAll("span.row-update-flash");
    expect(flashed.length).toBe(1);
    expect(flashed[0]!.text()).toBe("已下线");
  });
});
