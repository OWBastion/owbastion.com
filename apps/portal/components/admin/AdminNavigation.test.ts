import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminNavigation from "./AdminNavigation.vue";

describe("AdminNavigation", () => {
  it("groups review and title operations under achievements", async () => {
    const wrapper = await mountSuspended(AdminNavigation, {
      global: {
        stubs: { UNavigationMenu: { props: ["items"], template: '<div data-testid="nav" :data-items="JSON.stringify(items)" />' } },
      },
    });
    const items = JSON.parse(wrapper.get('[data-testid="nav"]').attributes("data-items")!) as Array<{ label: string; children?: Array<{ label: string; to: string }> }>;
    const achievements = items.find((item) => item.label === "成就");

    expect(achievements?.children).toEqual([
      expect.objectContaining({ label: "审核", to: "/admin/reviews" }),
      expect.objectContaining({ label: "成就管理", to: "/admin/achievements" }),
      expect.objectContaining({ label: "称号发放", to: "/admin/grants" }),
    ]);
  });
});
