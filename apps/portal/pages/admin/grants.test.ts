import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import GrantsAdminPage from "./grants.vue";

const adminApi = vi.fn((path: string, options?: { method?: string }) => {
  if (path.startsWith("/v1/player-accounts?")) return Promise.resolve({ items: [{ playerAccountId: "player-1", playerId: "1001", playerName: "玩家一", status: "active" }, { playerAccountId: "player-2", playerId: "1002", playerName: "玩家二", status: "active" }] });
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map.samoa", mapName: "萨摩亚" }] });
  if (path === "/v1/titles") return Promise.resolve({ items: [{ titleKey: "GLOBAL", label: "全局称号", category: "测试", availability: "active", scope: "global" }] });
  if (path === "/v1/titles?mapId=map.samoa") return Promise.resolve({ items: [{ titleKey: "MAP_TITLE", label: "地图称号", category: "地图", availability: "retired", scope: "map", mapId: "map.samoa" }] });
  if (path === "/v1/title-grants/manual/batch" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", batchId: "batch-1", playerCount: 1, targetCount: 1, requestedCount: 1, createdCount: 1, alreadyOwnedCount: 0, items: [] });
  throw new Error(`Unexpected request: ${path}`);
});
const toastAdd = vi.fn();
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));

describe("admin grants page", () => {
  it("submits selected players and titles through one batch request", async () => {
    const wrapper = await mountSuspended(GrantsAdminPage, {
      global: {
        stubs: {
          AdminResponsiveDialog: { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' },
          UCheckbox: { props: ["modelValue"], emits: ["update:modelValue"], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>' },
        },
      },
    });
    await flushPromises();
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    await checkboxes[0]!.setValue(true);
    await checkboxes[2]!.setValue(true);
    await wrapper.get("button").trigger("click");
    await flushPromises();
    const confirmButtons = wrapper.findAll("button").filter((button) => button.text() === "确认发放");
    await confirmButtons.at(-1)!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/title-grants/manual/batch", expect.objectContaining({ method: "POST", body: { contractVersion: "1", playerAccountIds: ["player-1"], targets: [{ titleKey: "GLOBAL" }] } }));
    expect(toastAdd).toHaveBeenCalledWith({ title: "已处理 1 个称号授予", color: "success" });
  });
});
