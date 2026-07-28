import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TitleMigrationPage from "./titles.vue";

const grants = [
  { grantId: "grant-1", titleKey: "title-1", label: "传奇挑战者", category: "难度挑战", scope: "global", holderName: "Cold", status: "unclaimed" },
  { grantId: "grant-2", titleKey: "title-2", label: "大难不死", category: "生存与闪避", scope: "global", holderName: "Cold", status: "unclaimed" },
  { grantId: "grant-3", titleKey: "title-3", label: "幸运星", category: "随机事件", scope: "global", holderName: "Boo", status: "unclaimed" },
  { grantId: "grant-4", titleKey: "title-4", label: "征服者", category: "地图精通", scope: "map", mapName: "苏拉瓦萨", holderName: "Bin", status: "active", playerName: "吾携秋水揽星河", playerId: "5132" },
];
const players = [{ playerAccountId: "11111111-1111-4111-8111-111111111111", playerName: "吾携秋水揽星河", playerId: "5132" }];
const response = (items = grants) => ({ items, page: 1, pageSize: 20, total: new Set(items.map((grant) => grant.holderName)).size, hasMore: false, stats: { pendingHolderCount: 2, unclaimedGrantCount: 3, migratedGrantCount: 1 } });
const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path.includes("/v1/title-grants?query=") && path.includes("query=Cold")) return Promise.resolve(response(grants.filter((grant) => grant.holderName === "Cold")));
  if (path.includes("/v1/title-grants?query=")) return Promise.resolve(response());
  if (path === "/v1/player-accounts?page=1&pageSize=50") return Promise.resolve({ items: players });
  if (path === "/v1/title-grants/bulk" && options?.method === "POST") return Promise.resolve({ grantedCount: 2 });
  throw new Error(`Unexpected request: ${path}`);
});
const toastAdd = vi.fn();
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));
mockNuxtImport("useAdminApi", () => () => adminApi);

async function mountPage(): Promise<VueWrapper> {
  adminApi.mockClear();
  toastAdd.mockClear();
  const wrapper = await mountSuspended(TitleMigrationPage, { attachTo: document.body, global: { stubs: { NuxtLink: { template: "<a><slot /></a>" }, USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select aria-label="选择目标玩家帐号" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' } } } });
  await flushPromises();
  return wrapper;
}

describe("title migration page", () => {
  it("shows migration metrics and selects a holder without opening the dialog", async () => {
    const wrapper = await mountPage();
    expect(wrapper.findAll(".holder-item")).toHaveLength(3);
    expect(wrapper.text()).toContain("待处理持有者");
    expect(wrapper.text()).toContain("3");
    expect(wrapper.find("[role=dialog]").exists()).toBe(false);
    expect(wrapper.find(".detail-panel").text()).toContain("Cold");
  });

  it("searches and filters historical holders", async () => {
    const wrapper = await mountPage();
    await wrapper.get('input[aria-label="搜索历史称号"]').setValue("Cold");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.findAll(".holder-item")).toHaveLength(1);
    expect(wrapper.text()).toContain("Cold");
    expect(wrapper.text()).not.toContain("Boo");
  });

  it("confirms bulk migration after selecting a player", async () => {
    const wrapper = await mountPage();
    await wrapper.get('select[aria-label="选择目标玩家帐号"]').setValue(players[0].playerAccountId);
    const bulk = wrapper.findAll("button").find((button) => button.text() === "关联全部未关联项");
    expect(bulk).toBeDefined();
    await bulk!.trigger("click");
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Cold");
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("吾携秋水揽星河#5132");
    const confirmButton = Array.from(document.body.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent?.includes("确认关联")) as HTMLButtonElement;
    confirmButton.click();
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/bulk", expect.objectContaining({ method: "POST", body: expect.objectContaining({ holderName: "Cold", playerAccountId: players[0].playerAccountId }) }));
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "已关联 2 项称号", color: "success" }));
  });
});
