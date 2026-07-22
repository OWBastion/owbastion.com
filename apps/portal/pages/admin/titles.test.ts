import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TitleMigrationPage from "./titles.vue";

const grants = [
  { grantId: "grant-1", titleKey: "title-1", label: "传奇挑战者", category: "难度挑战", scope: "global", holderName: "Cold", status: "unclaimed" },
  { grantId: "grant-2", titleKey: "title-2", label: "大难不死", category: "生存与闪避", scope: "global", holderName: "Cold", status: "unclaimed" },
  { grantId: "grant-3", titleKey: "title-3", label: "幸运星", category: "随机事件", scope: "global", holderName: "Boo", status: "unclaimed" },
];
const players = [{ playerAccountId: "11111111-1111-4111-8111-111111111111", playerName: "吾携秋水揽星河", playerId: "5132" }];
const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/title-grants?query=") return Promise.resolve({ items: grants });
  if (path === "/v1/title-grants?query=Cold") return Promise.resolve({ items: grants.filter((grant) => grant.holderName === "Cold") });
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
  const wrapper = await mountSuspended(TitleMigrationPage, { attachTo: document.body, global: { stubs: { NuxtLink: { template: "<a><slot /></a>" }, USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select aria-label="选择玩家" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' } } } });
  await flushPromises();
  return wrapper;
}

describe("title migration page", () => {
  it("groups historical grants and requires a selected player for bulk migration", async () => {
    const wrapper = await mountPage();
    expect(wrapper.findAll(".holder-group")).toHaveLength(2);
    expect(wrapper.get(".holder-group button").attributes("disabled")).toBeDefined();
  });

  it("replaces the list with matching historical holders after searching", async () => {
    const wrapper = await mountPage();
    await wrapper.get('input[aria-label="搜索历史称号"]').setValue("Cold");
    await wrapper.findAll(".admin-toolbar button").find((button) => button.text() === "搜索")!.trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".holder-group")).toHaveLength(1);
    expect(wrapper.text()).toContain("Cold");
    expect(wrapper.text()).not.toContain("Boo");
  });

  it("confirms bulk migration and restores focus after completion", async () => {
    const wrapper = await mountPage();
    await wrapper.get('select[aria-label="选择玩家"]').setValue(players[0].playerAccountId);
    const trigger = wrapper.get(".holder-group button");
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger("click");
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("Cold");
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("吾携秋水揽星河#5132");
    (document.body.querySelector(".sheet-actions button:last-child") as HTMLButtonElement).click();
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/bulk", expect.objectContaining({ method: "POST", body: expect.objectContaining({ holderName: "Cold", playerAccountId: players[0].playerAccountId }) }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "已关联 2 项", color: "success" });
  });
});
