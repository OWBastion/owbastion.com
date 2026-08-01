import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MapTitlesPage from "./map-titles.vue";

const rule = { ruleId: "rule.conqueror", titleKey: "CONQUEROR", titleName: "征服者", kind: "conqueror", condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual", displayKind: "map_name_suffix", slot: "conqueror", defaultScope: "all_active", status: "active", introducedVersion: "26.0730.1", retiredVersion: null };
const inheritance = { mapId: "map.paris", rule, projected: true, source: "map_title_rule" as const, effective: { condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual" as const, slot: "conqueror" as const }, exception: null };
const api = vi.fn((path: string, options?: { method?: string }) => {
  if (path === "/v1/map-title-rules") return Promise.resolve({ items: [rule] });
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map.paris", mapName: "巴黎" }] });
  if (path === "/v1/maps/map.paris/map-title-inheritance") return Promise.resolve({ items: [inheritance] });
  if (path.includes("/exception") && options?.method === "PUT") return Promise.resolve();
  if (path === "/v1/map-title-rules" && options?.method === "POST") return Promise.resolve(rule);
  throw new Error(`Unexpected ${path}`);
});
mockNuxtImport("useAdminApi", () => () => api);

describe("map title rule admin", () => {
  it("shows a rule source, keeps its map projection read-only, and opens a new rule form", async () => {
    const wrapper = await mountSuspended(MapTitlesPage, { global: { stubs: { AdminResponsiveDialog: { props: ["open", "title"], template: "<div v-if='open'><h2>{{ title }}</h2><slot name='body' /><slot name='footer' /></div>" }, UCard: { template: "<div><slot name='header' /><slot /></div>" }, USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: "<select :value='modelValue'><option v-for='item in items' :value='item.value'>{{ item.label }}</option></select>" }, UFormField: { template: "<label><slot /></label>" }, UTextarea: { template: "<textarea />" }, UInput: { template: "<input />" }, UButton: { template: "<button><slot />{{ label }}</button>", props: ["label"] }, USwitch: { template: "<input type='checkbox' />" }, UAlert: { template: "<div />" } } } });
    await flushPromises();
    expect(wrapper.text()).toContain("征服者");
    expect(wrapper.text()).toContain("地图名 + 后缀称号");
    expect(wrapper.text()).not.toContain("地图先锋");
    expect(wrapper.text()).toContain("规则 conqueror");
    expect(wrapper.text()).toContain("已投影，只读");
    expect(wrapper.text()).toContain("保存例外");
    const newRuleButton = wrapper.findAll("button").find((button) => button.text().includes("新建规则"));
    expect(newRuleButton).toBeDefined();
    await newRuleButton!.trigger("click");
    expect(wrapper.text()).toContain("新建权威规则");
    wrapper.unmount();
  });
});
