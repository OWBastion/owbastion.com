import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { reactive, ref } from "vue";
import { describe, expect, it } from "vitest";
import AppHeader from "./AppHeader.vue";

const route = reactive({ path: "/admin" });
mockNuxtImport("useRoute", () => () => route);
mockNuxtImport("useCurrentPlayer", () => () => ({ player: ref(null), loaded: ref(true), refresh: async () => null, logout: async () => undefined }));

describe("AppHeader", () => {
  it("shows the management navigation on admin routes", async () => {
    const wrapper = await mountSuspended(AppHeader, { global: { stubs: { ThemeMenu: true, AccountMenu: true, NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" } } } });

    expect(wrapper.get(".main-nav").attributes("aria-label")).toBe("管理导航");
    expect(wrapper.text()).toContain("概览");
    expect(wrapper.text()).toContain("玩家");
    expect(wrapper.text()).toContain("审核");
    expect(wrapper.text()).toContain("渠道");
    expect(wrapper.text()).toContain("成就");
    expect(wrapper.text()).not.toContain("称号迁移");
    expect(wrapper.text()).not.toContain("天梯排名");
  });
});
