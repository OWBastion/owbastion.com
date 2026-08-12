import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import AppHeader from "./AppHeader.vue";

const route = reactive({ path: "/admin", fullPath: "/admin" });
mockNuxtImport("useRoute", () => () => route);
mockNuxtImport("useCurrentPlayer", () => () => ({ player: ref(null), loaded: ref(true), refresh: async () => null, logout: async () => undefined }));

/**
 * Mobile nav disclosure contract (documented for #62):
 * - Opening moves focus to the first focusable control inside the panel.
 * - Tab/Shift+Tab are trapped inside the panel (last -> first, first -> last).
 * - Arrow/Home/End are left to UNavigationMenu (no custom roving layer).
 * - Escape closes and restores focus to the trigger.
 * - Outside pointer and route changes close without focus restoration.
 */
let focused: HTMLElement[];
let focusSpy: ReturnType<typeof vi.spyOn>;

async function mountHeader() {
  focused = [];
  focusSpy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement) {
    focused.push(this);
  });
  return mountSuspended(AppHeader, {
    global: {
      stubs: {
        ThemeMenu: true,
        LazyAccountMenu: true,
        NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" },
      },
    },
  });
}

describe("AppHeader", () => {
  it("shows the management navigation on admin routes", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    const wrapper = await mountHeader();

    expect(wrapper.get(".main-nav").attributes("aria-label")).toBe("管理导航");
    expect(wrapper.text()).toContain("概览");
    expect(wrapper.text()).toContain("内容编辑");
    expect(wrapper.text()).toContain("玩家");
    expect(wrapper.text()).toContain("绑定");
    expect(wrapper.text()).toContain("成就与称号");
    expect(wrapper.text()).not.toContain("地图称号规则");
    expect(wrapper.text()).not.toContain("天梯排名");

    const toggle = wrapper.get(".mobile-menu-toggle");
    expect(toggle.attributes("aria-controls")).toBe("mobile-nav");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    const studioLink = wrapper.find(".main-nav a[href=\"/api/studio/login?redirect=%2Fstudio\"]");
    expect(studioLink.exists()).toBe(true);
    expect(studioLink.attributes("target")).toBe("_blank");
    expect(studioLink.attributes("rel")).toBe("noopener");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("#mobile-nav").attributes("aria-label")).toBe("移动端管理导航");
    focusSpy.mockRestore();
  });

  it("moves focus into the mobile nav and traps Tab within it", async () => {
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();
    const toggle = wrapper.get(".mobile-menu-toggle");

    await toggle.trigger("click");
    await flushPromises();

    const nav = wrapper.get("#mobile-nav");
    expect(nav.exists()).toBe(true);
    const links = nav.findAll("a");
    expect(links.length).toBe(4);
    const first = links[0];
    const last = links[links.length - 1];

    // Opening moves focus to the first focusable control.
    expect(focused.at(-1)).toBe(first.element);

    // Shift+Tab from the first control wraps to the last control.
    focused = [];
    const shiftTabEvent = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    first.element.dispatchEvent(shiftTabEvent);
    expect(shiftTabEvent.defaultPrevented).toBe(true);
    expect(focused.at(-1)).toBe(last.element);

    // Tab from the last control wraps back to the first control.
    focused = [];
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.element.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(focused.at(-1)).toBe(first.element);

    focusSpy.mockRestore();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();
    const toggle = wrapper.get(".mobile-menu-toggle");
    await toggle.trigger("click");
    await flushPromises();
    focused = [];

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    await flushPromises();

    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    expect(focused.at(-1)).toBe(toggle.element);
    focusSpy.mockRestore();
  });

  it("closes on outside pointer interaction without restoring focus", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    const wrapper = await mountHeader();
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(true);

    focused = [];
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await flushPromises();

    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    expect(focused).toHaveLength(0);
    focusSpy.mockRestore();
  });

  it("closes the mobile panel when the route changes", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    const wrapper = await mountHeader();
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(true);

    route.path = "/admin/players";
    route.fullPath = "/admin/players";
    await flushPromises();

    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    focusSpy.mockRestore();
  });

  it("uses shared pressable feedback on mobile navigation links", async () => {
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    await flushPromises();

    const links = wrapper.findAll("#mobile-nav a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.classes()).toContain("pressable");
    }
    focusSpy.mockRestore();
  });

  it("exposes one concise update route on public navigation", async () => {
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();

    expect(wrapper.findAll(".main-nav a").filter((link) => link.text() === "版本更新")).toHaveLength(1);
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    expect(wrapper.findAll("#mobile-nav a").filter((link) => link.text() === "版本更新")).toHaveLength(1);
    expect(wrapper.find("#mobile-nav a[href=\"/changelog\"]").exists()).toBe(true);
    focusSpy.mockRestore();
  });
});
