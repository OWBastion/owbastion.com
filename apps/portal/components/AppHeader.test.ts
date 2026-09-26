import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import AppHeader from "./AppHeader.vue";

const route = reactive({ path: "/admin", fullPath: "/admin", query: {} as Record<string, string> });
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
    route.query = {};
    const wrapper = await mountHeader();

    expect(wrapper.get(".main-nav").attributes("aria-label")).toBe("管理导航");
    expect(wrapper.text()).toContain("称号");
    expect(wrapper.text()).toContain("挑战");
    expect(wrapper.text()).toContain("地图");
    expect(wrapper.text()).toContain("随机事件");
    expect(wrapper.text()).toContain("玩家");
    expect(wrapper.text()).toContain("邀请");
    expect(wrapper.text()).toContain("截图审核");
    expect(wrapper.text()).toContain("OCR");
    expect(wrapper.text()).toContain("评价与审核");
    expect(wrapper.text()).toContain("更多");
    expect(wrapper.text()).not.toContain("待处理");
    expect(wrapper.text()).not.toContain("内容编辑");
    expect(wrapper.text()).not.toContain("天梯排名");
    expect(wrapper.find('nav[aria-label="管理导航"] a[href="/admin/achievements?section=catalog"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="管理导航"] a[href="/admin/achievements?section=generic"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="管理导航"] a[href="/admin/maps"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="管理导航"] a[href="/admin/events"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="管理导航"] a[href="/admin/reviews"]').exists()).toBe(true);
    expect(wrapper.find('nav[aria-label="管理导航"] a[href="/admin/player-reviews"]').exists()).toBe(true);

    const toggle = wrapper.get('button[aria-label="打开菜单"]');
    // aria-controls must be absent while the panel is not in the DOM (no-missing-references regression).
    expect(toggle.attributes("aria-controls")).toBeUndefined();
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    // aria-controls must be present and reference the panel once it is in the DOM.
    expect(toggle.attributes("aria-controls")).toBe("mobile-nav");
    expect(wrapper.get("#mobile-nav").attributes("aria-label")).toBe("移动端管理导航");
    focusSpy.mockRestore();
  });

  it("moves focus into the mobile nav and traps Tab within it", async () => {
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();
    const toggle = wrapper.get('button[aria-label="打开菜单"]');

    await toggle.trigger("click");
    await flushPromises();

    const nav = wrapper.get("#mobile-nav");
    expect(nav.exists()).toBe(true);
    const links = nav.findAll("a");
    expect(links.length).toBe(5);
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
    const toggle = wrapper.get('button[aria-label="打开菜单"]');
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

  it("dims the page behind the mobile nav and closes from the scrim", async () => {
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    await flushPromises();

    const scrim = wrapper.get('[aria-hidden="true"]');
    expect(scrim.attributes("aria-hidden")).toBe("true");
    expect(wrapper.find("#mobile-nav").exists()).toBe(true);

    focused = [];
    await scrim.trigger("pointerdown");
    await flushPromises();

    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    expect(scrim.element.isConnected).toBe(false);
    expect(focused).toHaveLength(0);
    focusSpy.mockRestore();
  });

  it("closes on outside pointer interaction without restoring focus", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    route.query = {};
    const wrapper = await mountHeader();
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(true);

    focused = [];
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await flushPromises();

    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    expect(focused).toHaveLength(0);
    focusSpy.mockRestore();
  });

  it("expands nested admin groups without closing the mobile panel", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    const wrapper = await mountHeader();
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    await flushPromises();

    const nav = wrapper.get("#mobile-nav");
    const playerTrigger = nav.findAll("button").find((button) => button.text().includes("玩家"));
    const invitationsTrigger = nav.findAll("button").find((button) => button.text().includes("邀请"));
    const maintenanceTrigger = nav.findAll("button").find((button) => button.text().includes("更多"));
    expect(playerTrigger).toBeTruthy();
    expect(invitationsTrigger).toBeTruthy();
    expect(maintenanceTrigger).toBeTruthy();

    await playerTrigger!.trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(true);
    expect(nav.text()).toContain("玩家列表");
    expect(nav.text()).toContain("绑定例外");
    expect(nav.find("a[href=\"/admin/bindings\"]").exists()).toBe(true);

    await invitationsTrigger!.trigger("click");
    await flushPromises();
    expect(nav.text()).toContain("邀请管理");
    expect(nav.text()).toContain("QQ 群组策略");
    expect(nav.find('a[href="/admin/bindings?tab=invitations"]').exists()).toBe(true);
    expect(nav.find('a[href="/admin/channels"]').exists()).toBe(true);

    await maintenanceTrigger!.trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(true);
    expect(nav.text()).toContain("通关记录");
    expect(nav.text()).toContain("称号授予");
    expect(nav.find("a[href=\"/admin/mastery-runs\"]").exists()).toBe(true);

    await nav.get("a[href=\"/admin/bindings\"]").trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    focusSpy.mockRestore();
  });

  it("closes the mobile panel when the route changes", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    route.query = {};
    const wrapper = await mountHeader();
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(true);

    route.path = "/admin/players";
    route.fullPath = "/admin/players";
    await flushPromises();

    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    focusSpy.mockRestore();
  });

  it("exposes one concise update route on public navigation", async () => {
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();

    expect(wrapper.findAll('nav[aria-label="主导航"] a').filter((link) => link.text() === "版本更新")).toHaveLength(1);
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    expect(wrapper.findAll("#mobile-nav a").filter((link) => link.text() === "版本更新")).toHaveLength(1);
    expect(wrapper.find("#mobile-nav a[href=\"/changelog\"]").exists()).toBe(true);
    focusSpy.mockRestore();
  });
});
