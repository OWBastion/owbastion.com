import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { reactive, ref } from "vue";
import { describe, expect, it } from "vitest";
import AppHeader from "./AppHeader.vue";

const route = reactive({ path: "/admin" });
mockNuxtImport("useRoute", () => () => route);
mockNuxtImport("useCurrentPlayer", () => () => ({ player: ref(null), loaded: ref(true), refresh: async () => null, logout: async () => undefined }));

describe("AppHeader", () => {
  it("shows the management navigation on admin routes", async () => {
    const wrapper = await mountSuspended(AppHeader, { global: { stubs: {
      ThemeMenu: true,
      AccountMenu: true,
      NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" },
      UNavigationMenu: { props: ["items"], template: '<div data-testid="admin-navigation" :data-items="JSON.stringify(items)" />' },
    } } });

    expect(wrapper.get(".main-nav").attributes("aria-label")).toBe("管理导航");
    const items = JSON.parse(wrapper.get('[data-testid="admin-navigation"]').attributes("data-items")!);
    expect(items.find((item: { label: string }) => item.label === "成就").children).toEqual([
      expect.objectContaining({ label: "审核", to: "/admin/reviews" }),
      expect.objectContaining({ label: "成就管理", to: "/admin/achievements" }),
      expect.objectContaining({ label: "称号发放", to: "/admin/grants" }),
    ]);
    expect(wrapper.text()).not.toContain("天梯排名");
  });
});
