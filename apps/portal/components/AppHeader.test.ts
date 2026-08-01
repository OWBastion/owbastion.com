import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import AppHeader from "./AppHeader.vue";

const route = reactive({ path: "/admin" });
mockNuxtImport("useRoute", () => () => route);
mockNuxtImport("useCurrentPlayer", () => () => ({ player: ref(null), loaded: ref(true), refresh: async () => null, logout: async () => undefined }));

// happy-dom cannot move real focus, so spy on focus() and replay the focusin
// event the browser would dispatch, letting the roving handler track the item.
let focused: HTMLElement[];
let focusSpy: ReturnType<typeof vi.spyOn>;

async function mountHeader() {
  focused = [];
  focusSpy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement) {
    focused.push(this);
    this.dispatchEvent(new Event("focusin", { bubbles: true }));
  });
  return mountSuspended(AppHeader, { global: { stubs: {
    ThemeMenu: true,
    LazyAccountMenu: true,
    NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" },
  } } });
}

describe("AppHeader", () => {
  it("shows the management navigation on admin routes", async () => {
    const wrapper = await mountHeader();

    expect(wrapper.get(".main-nav").attributes("aria-label")).toBe("管理导航");
    expect(wrapper.text()).toContain("概览");
    expect(wrapper.text()).toContain("玩家");
    expect(wrapper.text()).toContain("绑定");
    expect(wrapper.text()).toContain("成就与称号");
    expect(wrapper.text()).not.toContain("地图称号规则");
    expect(wrapper.text()).not.toContain("天梯排名");
    expect(wrapper.get(".mobile-menu-toggle").attributes("aria-controls")).toBeUndefined();
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    expect(wrapper.get(".mobile-menu-toggle").attributes("aria-controls")).toBe("mobile-nav");
    expect(wrapper.get("#mobile-nav").exists()).toBe(true);
    focusSpy.mockRestore();
  });

  it("traps focus and supports roving keys inside the mobile panel (N-03)", async () => {
    const wrapper = await mountHeader();
    await wrapper.get(".mobile-menu-toggle").trigger("click");
    await flushPromises();

    // Mirrors the roving selector used by AppHeader (N-03) — UNavigationMenu renders
    // an outer anchor wrapping an inner [data-slot="link"] button.
    const nav = wrapper.get("#mobile-nav");
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-slot="link"], [data-slot="trigger"], [tabindex]:not([tabindex="-1"])';
    const items = nav.findAll(selector);
    expect(items.length).toBeGreaterThan(1);
    // Opening moves focus to the first item (N-03).
    expect(focused[0]).toBe(items[0].element);

    await nav.trigger("keydown", { key: "ArrowDown" });
    expect(focused.at(-1)).toBe(items[1].element);
    await nav.trigger("keydown", { key: "ArrowUp" });
    expect(focused.at(-1)).toBe(items[0].element);
    await nav.trigger("keydown", { key: "End" });
    expect(focused.at(-1)).toBe(items[items.length - 1].element);
    await nav.trigger("keydown", { key: "Home" });
    expect(focused.at(-1)).toBe(items[0].element);

    // Shift+Tab on the first item wraps to the last — focus never leaks to the page.
    await nav.trigger("keydown", { key: "Tab", shiftKey: true });
    expect(focused.at(-1)).toBe(items[items.length - 1].element);

    // Escape closes and returns focus to the trigger (listener is on document).
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    expect(focused.at(-1)).toBe(wrapper.get(".mobile-menu-toggle").element);
    focusSpy.mockRestore();
  });
});
