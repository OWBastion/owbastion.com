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
 * - Opening keeps focus on the trigger; Tab may enter the panel in document order.
 * - Tab/Shift+Tab are not trapped inside the non-modal panel.
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
    expect(wrapper.find(".main-nav a[href=\"/admin/content\"]").exists()).toBe(true);
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("#mobile-nav").attributes("aria-label")).toBe("移动端管理导航");
    focusSpy.mockRestore();
  });

  it("keeps focus on the trigger when opening and does not trap Tab", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    const wrapper = await mountHeader();
    const toggle = wrapper.get(".mobile-menu-toggle");
    const focusCountBeforeOpen = focused.length;

    await toggle.trigger("click");
    await flushPromises();

    expect(wrapper.get("#mobile-nav").exists()).toBe(true);
    // Disclosure keeps focus on the trigger — no next-tick focus move into the panel.
    expect(focused.length).toBe(focusCountBeforeOpen);

    const nav = wrapper.get("#mobile-nav");
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    nav.element.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);

    const shiftTabEvent = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    nav.element.dispatchEvent(shiftTabEvent);
    expect(shiftTabEvent.defaultPrevented).toBe(false);

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

    expect(wrapper.findAll(".main-nav a").filter((link) => link.text() === "版本记录")).toHaveLength(1);
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    expect(wrapper.findAll("#mobile-nav a").filter((link) => link.text() === "版本记录")).toHaveLength(1);
    expect(wrapper.find("#mobile-nav a[href=\"/changelog\"]").exists()).toBe(true);
    focusSpy.mockRestore();
  });
});
