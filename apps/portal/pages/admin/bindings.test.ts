import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import BindingsPage from "./bindings.vue";

const adminApi = vi.fn((path: string, options?: any) => {
  if (path === "/v1/binding-claims") {
    return Promise.resolve({
      items: [
        {
          claimId: "claim-1",
          playerName: "PlayerOne",
          playerId: "1234",
          status: "pending_review",
          createdAt: 1000,
          invitedBy: "admin",
          memberOpenId: "member-1",
          groupOpenId: "group-1",
          targetAccountBinding: { bindingId: "old-b1", memberOpenId: "old-member-1" },
          qqBoundAccounts: [{ playerAccountId: "p-acc-2", playerName: "PlayerTwo", playerId: "5678" }],
          revokingBindingCount: 2,
          invalidatingSessionCount: 1,
          operationType: "conflict",
        },
        {
          claimId: "claim-2",
          playerName: "PlayerThree",
          playerId: "9999",
          status: "pending_review",
          createdAt: 2000,
          invitedBy: "admin",
          memberOpenId: "member-3",
          groupOpenId: "group-3",
          revokingBindingCount: 0,
          invalidatingSessionCount: 0,
          operationType: "initial_binding",
        },
      ],
    });
  }
  if (path === "/v1/binding-invites") {
    return Promise.resolve({ items: [] });
  }
  if (path.startsWith("/v1/binding-claims/") && path.endsWith("/decision")) {
    return Promise.resolve();
  }
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin bindings page", () => {
  it("renders claims with operation type badges and handles conflict secondary confirmation", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(BindingsPage, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain("PlayerOne");
    expect(wrapper.text()).toContain("冲突");
    expect(wrapper.text()).toContain("首次绑定");

    // Click details button on claim-1. The table's default sorting may place
    // newer claims before it, so target the row by its player identity.
    const claimOneRow = () => wrapper.findAll("tr").find((row) => row.text().includes("PlayerOne"))!;
    await claimOneRow().findAll(".claim-actions button").find((btn) => btn.text() === "详情")!.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("绑定申请详情");
    expect(document.body.textContent).toContain("目标战网账号当前绑定");
    expect(document.body.textContent).toContain("old-member-1");
    expect(document.body.textContent).toContain("PlayerTwo#5678");
    expect(document.body.textContent).toContain("2 个");

    // Close detail modal
    const closeButtons = Array.from(document.body.querySelectorAll("button")).filter((btn) => btn.textContent?.trim() === "关闭");
    if (closeButtons.length > 0) {
      closeButtons[0].click();
      await flushPromises();
    }

    // Click approve button for the conflicting claim.
    await claimOneRow().findAll(".claim-actions button").find((btn) => btn.text() === "批准")!.trigger("click");
    await flushPromises();

    // Verify secondary confirmation modal is opened
    expect(document.body.textContent).toContain("确认批准冲突申请");
    expect(document.body.textContent).toContain("身份冲突提示");

    // Click secondary confirmation button
    const confirmButton = Array.from(document.body.querySelectorAll("button")).find((btn) => btn.textContent?.trim() === "确认批准");
    expect(confirmButton).not.toBeUndefined();
    const listCallsBefore = adminApi.mock.calls.filter(([path]) => path === "/v1/binding-claims").length;
    confirmButton?.click();
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith(
      "/v1/binding-claims/claim-1/decision",
      expect.objectContaining({
        method: "POST",
        body: { contractVersion: "1", decision: "approved" },
      }),
    );
    // A-04 — the row updates in place: status flips to 已批准 and the list is
    // not re-fetched, so the page does not flash through a full reload.
    expect(wrapper.text()).toContain("已批准");
    expect(adminApi.mock.calls.filter(([path]) => path === "/v1/binding-claims").length).toBe(listCallsBefore);
  });
});
