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
      LazyAccountMenu: true,
      NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" },
    } } });

    expect(wrapper.get(".main-nav").attributes("aria-label")).toBe("管理导航");
    expect(wrapper.text()).toContain("概览");
    expect(wrapper.text()).toContain("玩家");
    expect(wrapper.text()).toContain("绑定");
    expect(wrapper.text()).not.toContain("天梯排名");
    expect(wrapper.get(".mobile-menu-toggle").attributes("aria-controls")).toBeUndefined();
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    expect(wrapper.get(".mobile-menu-toggle").attributes("aria-controls")).toBe("mobile-nav");
    expect(wrapper.get("#mobile-nav").exists()).toBe(true);
  });
});
