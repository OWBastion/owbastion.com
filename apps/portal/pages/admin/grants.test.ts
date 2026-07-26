import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import GrantsPage from "./grants.vue";

const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/player-accounts?page=1&pageSize=50") return Promise.resolve({ items: [{ playerAccountId: "11111111-1111-4111-8111-111111111111", playerName: "Player", playerId: "1" }] });
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map.samoa", mapName: "萨摩亚" }] });
  if (path === "/v1/titles") return Promise.resolve({ items: [{ titleKey: "GLOBAL", label: "全局称号", category: "测试", condition: "测试", availability: "active", scope: "global" }] });
  if (path === "/v1/titles?mapId=map.samoa") return Promise.resolve({ items: [{ titleKey: "GLOBAL", label: "全局称号", category: "测试", condition: "测试", availability: "active", scope: "global" }, { titleKey: "OLD_MAP", label: "旧地图称号", category: "历史", condition: "测试", availability: "retired", scope: "map", mapId: "map.samoa", slot: "conqueror" }] });
  if (path === "/v1/title-grants/manual" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", grantId: "00000000-0000-4000-8000-000000000001", titleKey: "OLD_MAP", titleName: "旧地图称号", mapId: "map.samoa", slot: "conqueror", alreadyOwned: false });
  throw new Error(`Unexpected request: ${path}`);
});
const toastAdd = vi.fn();
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));

describe("manual title grants page", () => {
  it("shows retired labels and submits only the explicit reward scope", async () => {
    const wrapper = await mountSuspended(GrantsPage, {
      attachTo: document.body,
      global: {
        stubs: {
          USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
          UTextarea: { props: ["modelValue"], emits: ["update:modelValue"], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        },
      },
    });
    await flushPromises();
    expect(wrapper.findAll("option").some((option) => option.text().includes("旧地图称号 · 萨摩亚（不再发放）"))).toBe(true);
    const selects = wrapper.findAll("select");
    await selects[0]!.setValue("11111111-1111-4111-8111-111111111111");
    await selects[1]!.setValue("OLD_MAP:map.samoa");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/manual", expect.objectContaining({ method: "POST", body: { contractVersion: "1", playerAccountId: "11111111-1111-4111-8111-111111111111", titleKey: "OLD_MAP", mapId: "map.samoa" } }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "已发放「旧地图称号」", color: "success" });
  });
});
