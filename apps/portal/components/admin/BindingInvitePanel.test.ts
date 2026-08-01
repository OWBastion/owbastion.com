import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import BindingInvitePanel from "./BindingInvitePanel.vue";

const adminApi = vi.fn((path: string) => {
  if (path.startsWith("/v1/title-grants?")) return Promise.resolve({ items: [{ grantId: "hist.1", label: "征服者", category: "地图称号", mapName: "测试地图", holderName: "历史玩家", status: "unclaimed" }] });
  if (path === "/v1/binding-invites") return Promise.resolve({ inviteId: "invite-1", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1, historicalMigration: { requestedCount: 1 } });
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

describe("BindingInvitePanel", () => {
  it("requires explicit holder selection and sends selected historical record ids", async () => {
    const wrapper = await mountSuspended(BindingInvitePanel);
    await flushPromises();
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("Player");
    await inputs[1]!.setValue("1234");
    await wrapper.get(".historical-holder").trigger("click");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/binding-invites", expect.objectContaining({ method: "POST", body: { contractVersion: "1", playerName: "Player", playerId: "1234", historicalTitleGrantIds: ["hist.1"] } }));
  });
});
