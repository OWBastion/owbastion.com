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
  if (path === "/v1/title-grants/grant-1/restore" && options?.method === "POST") return Promise.resolve();
  if (path === "/v1/title-grants/grant-revoked/restore" && options?.method === "POST") return Promise.resolve();
  if (path === "/v1/player-accounts/player-1/titles/equipped" && options?.method === "PUT") return Promise.resolve({ contractVersion: "1", grantIds: [] });
  throw new Error(`Unexpected request: ${path}`);
});
const toastAdd = vi.fn();
const dialogStub = { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' };
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));

const grantOf = (overrides: Record<string, unknown> = {}) => ({ grantId: "grant-1", titleKey: "GLOBAL", label: "全局称号", icon: "award", category: "测试", condition: "测试", scope: "global" as const, grantedAt: 0, status: "active" as const, revocationType: null, sourceType: "manual" as const, grantedBy: "admin", ...overrides });
const mountTitles = (titleGrants: unknown[], stubs: Record<string, unknown> = {}) => mountSuspended(AdminPlayerTitles, {
  props: { playerAccountId: "player-1", titleGrants } as never,
  global: { stubs: { AdminResponsiveDialog: dialogStub, ...stubs } },
});

describe("AdminPlayerTitles", () => {
  it("groups map titles under their map and issues titles through the grant dialog", async () => {
    toastAdd.mockClear();
    const wrapper = await mountTitles(
      [grantOf(), grantOf({ grantId: "grant-map", titleKey: "OLD_MAP", label: "旧地图称号", scope: "map", mapName: "萨摩亚", slot: "conqueror" })],
      {
        UInputMenu: { props: ["modelValue", "items", "multiple"], emits: ["update:modelValue"], template: '<div><label v-for="item in items" :key="item.value"><input type="checkbox" :value="item.value" @change="$emit(\'update:modelValue\', [...(modelValue || []), item])" />{{ item.label }}</label></div>' },
        UTextarea: { props: ["modelValue"], emits: ["update:modelValue"], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
      },
    );
    await flushPromises();
    expect(wrapper.get('[aria-label="萨摩亚称号"]').text()).toContain("旧地图称号");
    (wrapper.vm as unknown as { openGrant: () => void }).openGrant();
    await flushPromises();
    expect(wrapper.text()).toContain("系统会通过对应的手动挑战记录完成，再授予称号。");
    expect(wrapper.findAll("label").some((label) => label.text().includes("旧地图称号（不再发放）"))).toBe(true);
    const choices = wrapper.findAll("input");
    await choices[0]!.setValue(true);
    await choices[2]!.setValue(true);
    expect(wrapper.text()).toContain("已选择 2 项");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/manual/batch", expect.objectContaining({ method: "POST", body: { contractVersion: "1", playerAccountIds: ["player-1"], targets: [{ titleKey: "GLOBAL_2" }, { titleKey: "OLD_MAP", mapId: "map.samoa" }] } }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "已处理 2 个称号", color: "success" });
    expect(wrapper.emitted("changed")).toHaveLength(1);
  });

  it("revokes immediately without a dialog and offers an undo that restores the title", async () => {
    toastAdd.mockClear();
    const wrapper = await mountTitles([grantOf()]);
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "回收")!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/grant-1/revoke", expect.objectContaining({ method: "POST", body: { contractVersion: "1" } }));
    expect(wrapper.find("form#revoke-player-title").exists()).toBe(false);
    const toast = toastAdd.mock.calls.find(([call]) => call.title === "已回收全局称号")![0];
    expect(toast.actions[0].label).toBe("撤销");
    toast.actions[0].onClick();
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/grant-1/restore", expect.objectContaining({ method: "POST" }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "已恢复全局称号", color: "success" });
    expect(wrapper.emitted("changed")).toHaveLength(2);
  });

  it("flips the card at once on press and rolls back when the revoke fails", async () => {
    toastAdd.mockClear();
    const wrapper = await mountTitles([grantOf()]);
    await flushPromises();
    let fail: (error: Error) => void = () => {};
    adminApi.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    await wrapper.findAll("button").find((button) => button.text() === "回收")!.trigger("click");
    expect(wrapper.text()).toContain("已回收");
    fail(new Error("boom"));
    await flushPromises();
    expect(wrapper.text()).not.toContain("已回收");
    expect(wrapper.findAll("button").some((button) => button.text() === "回收")).toBe(true);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "无法回收称号", color: "error" }));
  });

  it("explains why an undo or restore was rejected", async () => {
    toastAdd.mockClear();
    const wrapper = await mountTitles([grantOf({ grantId: "grant-revoked", status: "revoked", revocationType: "administrator" })]);
    await flushPromises();
    adminApi.mockImplementationOnce(() => Promise.reject(new Error("conflict")));
    expect(wrapper.text()).toContain("已回收");
    await wrapper.findAll("button").find((button) => button.text() === "撤销回收")!.trigger("click");
    await flushPromises();
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "无法恢复全局称号", color: "error", description: expect.stringContaining("同一地图和版本已有当前称号时无法恢复") }));
  });

  it("lets maintainers recover an uninitialized ten-title selection", async () => {
    toastAdd.mockClear();
    const titleGrants = [
      ...Array.from({ length: 10 }, (_, index) => grantOf({ grantId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, titleKey: `GLOBAL_${index}`, label: `称号 ${index}`, grantedAt: index, equipped: false, equipable: true })),
      grantOf({ grantId: "00000000-0000-4000-8000-000000000011", titleKey: "GLOBAL_MAP", label: "地图来源全局称号", scope: "map", mapName: "萨摩亚", grantedAt: 11, equipped: false, equipable: true }),
    ];
    const wrapper = await mountTitles(titleGrants);
    await flushPromises();
    (wrapper.vm as unknown as { openEquip: () => void }).openEquip();
    await flushPromises();
    const checkboxes = wrapper.get("fieldset").findAll("input[type='checkbox']");
    expect(checkboxes).toHaveLength(11);
    await checkboxes[0]!.setValue(true);
    await wrapper.get("form#recover-player-titles").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/player-accounts/player-1/titles/equipped", expect.objectContaining({ method: "PUT", body: { contractVersion: "1", grantIds: [titleGrants[0]!.grantId] } }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "佩戴称号已修复", color: "success" });
  });
});
