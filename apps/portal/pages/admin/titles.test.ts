import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TitleMigrationPage from "./titles.vue";

const holders = [
  { holderName: "Cold", totalCount: 2, unclaimedCount: 2, status: "pending" as const },
  { holderName: "Boo", totalCount: 1, unclaimedCount: 1, status: "pending" as const },
  { holderName: "Bin", totalCount: 1, unclaimedCount: 0, status: "completed" as const },
];
const coldGrants = [
  { grantId: "grant-1", titleKey: "title-1", label: "传奇挑战者", category: "难度挑战", scope: "global", holderName: "Cold", status: "unclaimed" },
  { grantId: "grant-2", titleKey: "title-2", label: "大难不死", category: "生存与闪避", scope: "global", holderName: "Cold", status: "unclaimed" },
];
const players = [{ playerAccountId: "11111111-1111-4111-8111-111111111111", playerName: "吾携秋水揽星河", playerId: "5132" }];
const listResponse = (items = holders) => ({
  holders: items,
  page: 1,
  pageSize: 20,
  total: items.length,
  hasMore: false,
  filter: "all",
  stats: { pendingHolderCount: 2, unclaimedGrantCount: 3, migratedGrantCount: 1 },
});
const detailResponse = (holderName = "Cold", items = coldGrants) => ({
  holder: holders.find((holder) => holder.holderName === holderName) ?? holders[0],
  items,
  page: 1,
  pageSize: 50,
  total: items.length,
  hasMore: false,
  grantStatus: "all",
});

const adminApi = vi.fn((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path.includes("/v1/title-grants/holder?")) {
    const params = new URLSearchParams(path.split("?")[1]);
    const holderName = params.get("holderName") ?? "Cold";
    const grantStatus = params.get("grantStatus");
    if (grantStatus === "unclaimed") {
      return Promise.resolve({
        ...detailResponse(holderName, coldGrants.filter((grant) => grant.status === "unclaimed")),
        holder: { holderName: "Cold", totalCount: 2, unclaimedCount: 2, status: "pending" as const },
        grantStatus: "unclaimed",
      });
    }
    return Promise.resolve(detailResponse(holderName));
  }
  if (path.includes("/v1/title-grants?query=") && path.includes("query=Cold")) {
    return Promise.resolve(listResponse(holders.filter((holder) => holder.holderName === "Cold")));
  }
  if (path.includes("/v1/title-grants?query=")) return Promise.resolve(listResponse());
  if (path.startsWith("/v1/player-accounts?")) return Promise.resolve({ items: players, total: 1, hasMore: false });
  if (path === "/v1/title-grants/bulk" && options?.method === "POST") return Promise.resolve({ grantedCount: 2, skippedClaimedCount: 0 });
  if (path === "/v1/title-grants" && options?.method === "POST") return Promise.resolve(undefined);
  throw new Error(`Unexpected request: ${path}`);
});
const toastAdd = vi.fn();
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));
mockNuxtImport("useAdminApi", () => () => adminApi);

async function mountPage(): Promise<VueWrapper> {
  adminApi.mockClear();
  toastAdd.mockClear();
  const wrapper = await mountSuspended(TitleMigrationPage, {
    attachTo: document.body,
    global: {
      stubs: {
        NuxtLink: { template: "<a><slot /></a>" },
        USelectMenu: {
          props: ["modelValue", "items", "loading", "searchTerm"],
          emits: ["update:modelValue", "update:searchTerm"],
          template: `
            <div>
              <input aria-label="搜索玩家" :value="searchTerm" @input="$emit('update:searchTerm', $event.target.value)" />
              <select aria-label="选择目标玩家帐号" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
                <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
          `,
        },
      },
    },
  });
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
    expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("/v1/title-grants/holder?holderName=Cold"));
  });

  it("searches and filters historical holders on the server", async () => {
    const wrapper = await mountPage();
    await wrapper.get('input[aria-label="搜索历史称号"]').setValue("Cold");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("query=Cold"));
    expect(wrapper.findAll(".holder-item")).toHaveLength(1);
    expect(wrapper.text()).toContain("Cold");
    expect(wrapper.text()).not.toContain("Boo");
  });

  it("searches target players beyond the first page limit", async () => {
    const wrapper = await mountPage();
    await wrapper.get('input[aria-label="搜索玩家"]').setValue("吾携");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(expect.stringContaining("/v1/player-accounts?query="));
    expect(adminApi.mock.calls.some(([path]) => String(path).includes("pageSize=20"))).toBe(true);
  });

  it("confirms bulk migration using authoritative unclaimed scope", async () => {
    const wrapper = await mountPage();
    await wrapper.get('select[aria-label="选择目标玩家帐号"]').setValue(players[0].playerAccountId);
    await flushPromises();
    const bulk = wrapper.findAll("button").find((button) => button.text() === "关联全部未关联项");
    expect(bulk).toBeDefined();
    await bulk!.trigger("click");
    await flushPromises();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Cold");
    expect(dialog?.textContent).toContain("吾携秋水揽星河#5132");
    expect(dialog?.textContent).toContain("2 项未关联称号");
    const confirmButton = Array.from(document.body.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent?.includes("确认关联")) as HTMLButtonElement;
    confirmButton.click();
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/bulk", expect.objectContaining({ method: "POST", body: expect.objectContaining({ holderName: "Cold", playerAccountId: players[0].playerAccountId }) }));
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "已关联 2 项称号", color: "success" }));
    expect(adminApi.mock.calls.filter(([path]) => String(path).includes("/v1/title-grants?query=")).length).toBeGreaterThan(1);
  });
});
