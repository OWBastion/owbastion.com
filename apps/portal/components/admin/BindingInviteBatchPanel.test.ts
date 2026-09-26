import { installApiTestFetch } from "~/tests/utils/api-test-fetch";
import { flushPromises } from "@vue/test-utils";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import BindingInviteBatchPanel from "./BindingInviteBatchPanel.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/binding-invites/batch") return Promise.resolve({ items: [{ inviteId: "00000000-0000-0000-0000-000000000001", code: "ABCDEFGHIJKL", playerName: "Player", playerId: "1234", expiresAt: 1 }] });
  throw new Error(`Unexpected request: ${path}`);
});

installApiTestFetch({ admin: adminApi });

describe("BindingInviteBatchPanel", () => {
  it("generates one invitation per valid BattleTag and exposes its copy action", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(BindingInviteBatchPanel);
    await wrapper.find("textarea").setValue("Player#1234\nAnother#5678");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/binding-invites/batch", expect.objectContaining({
      method: "POST",
      body: { contractVersion: "1", invitations: [{ playerName: "Player", playerId: "1234" }, { playerName: "Another", playerId: "5678" }] },
    }));
    expect(wrapper.text()).toContain("Player#1234");
    expect(wrapper.get('button[aria-label="复制 Player 的绑定口令"]').text()).toContain("复制口令");
    expect(wrapper.emitted("created")).toHaveLength(1);
  });

  it("blocks malformed and duplicate BattleTags before requesting invitations", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(BindingInviteBatchPanel);
    await wrapper.find("textarea").setValue("Player#1234\nplayer#1234\ninvalid");

    expect(wrapper.text()).toContain("第 2 行重复");
    expect(wrapper.text()).toContain("第 3 行格式无效");
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
  });
});
