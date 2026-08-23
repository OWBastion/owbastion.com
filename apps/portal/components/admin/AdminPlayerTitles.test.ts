import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminPlayerTitles from "./AdminPlayerTitles.vue";

const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map.samoa", mapName: "萨摩亚" }] });
  if (path === "/v1/titles") return Promise.resolve({ items: [{ titleKey: "GLOBAL", label: "全局称号", category: "测试", condition: "测试", availability: "active", scope: "global" }, { titleKey: "GLOBAL_2", label: "第二个全局称号", category: "测试", condition: "测试", availability: "active", scope: "global" }] });
  if (path === "/v1/titles?mapId=map.samoa") return Promise.resolve({ items: [{ titleKey: "GLOBAL", label: "全局称号", category: "测试", condition: "测试", availability: "active", scope: "global" }, { titleKey: "OLD_MAP", label: "旧地图称号", category: "历史", condition: "测试", availability: "retired", scope: "map", mapId: "map.samoa", slot: "conqueror" }] });
  if (path === "/v1/title-grants/manual/batch" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", batchId: "batch-1", playerCount: 1, targetCount: 2, requestedCount: 2, createdCount: 2, alreadyOwnedCount: 0, items: [] });
  if (path === "/v1/title-grants/grant-1/revoke" && options?.method === "POST") return Promise.resolve();
  throw new Error(`Unexpected request: ${path}`);
});
const toastAdd = vi.fn();
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));

describe("AdminPlayerTitles", () => {
  it("shows current grants and issues a title for the current player", async () => {
    const wrapper = await mountSuspended(AdminPlayerTitles, {
      props: {
        playerAccountId: "player-1",
        titleGrants: [{ grantId: "grant-1", titleKey: "GLOBAL", label: "全局称号", icon: "award", category: "测试", condition: "测试", scope: "global", grantedAt: 0, sourceType: "manual", grantedBy: "admin" }],
      },
      global: {
        stubs: {
          AdminResponsiveDialog: { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' },
          UInputMenu: { props: ["modelValue", "items", "multiple"], emits: ["update:modelValue"], template: '<div><label v-for="item in items" :key="item.value"><input type="checkbox" :value="item.value" @change="$emit(\'update:modelValue\', [...(modelValue || []), item])" />{{ item.label }}</label></div>' },
          UTextarea: { props: ["modelValue"], emits: ["update:modelValue"], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        },
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("全局称号");
    await wrapper.get("[data-testid='open-title-grant']").trigger("click");
    expect(wrapper.text()).not.toContain("（可选）");
    expect(wrapper.text()).toContain("地图称号");
    expect(wrapper.findAll("label").some((label) => label.text().includes("旧地图称号（不再发放）"))).toBe(true);
    const choices = wrapper.findAll("input");
    await choices[0].setValue(true);
    await choices[2].setValue(true);
    expect(wrapper.text()).toContain("已选择 2 项");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/manual/batch", expect.objectContaining({ method: "POST", body: { contractVersion: "1", playerAccountIds: ["player-1"], targets: [{ titleKey: "GLOBAL_2" }, { titleKey: "OLD_MAP", mapId: "map.samoa" }] } }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "已处理 2 个称号", color: "success" });
  });

  it("confirms and revokes a current title without requiring a reason", async () => {
    const wrapper = await mountSuspended(AdminPlayerTitles, {
      props: {
        playerAccountId: "player-1",
        titleGrants: [{ grantId: "grant-1", titleKey: "GLOBAL", label: "全局称号", icon: "award", category: "测试", condition: "测试", scope: "global", grantedAt: 0, sourceType: "manual", grantedBy: "admin" }],
      },
      global: {
        stubs: {
          AdminResponsiveDialog: { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' },
          UTextarea: { props: ["modelValue"], emits: ["update:modelValue"], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        },
      },
    });
    await flushPromises();
    await wrapper.get("[data-testid='revoke-title-grant-grant-1']").trigger("click");
    expect(wrapper.text()).toContain("回收后，该称号将不再计入玩家当前称号；历史记录会保留。");
    await wrapper.get("form#revoke-player-title").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/grant-1/revoke", expect.objectContaining({ method: "POST", body: { contractVersion: "1" } }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "已回收全局称号", color: "success" });
  });
});
