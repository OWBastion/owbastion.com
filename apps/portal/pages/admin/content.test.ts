import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContentPage from "./content.vue";

const route = { query: {} as Record<string, string> };
mockNuxtImport("useRoute", () => () => route);

const expandSidebar = vi.fn(() => document.body.setAttribute("data-expand-sidebar", "true"));
const collapseSidebar = vi.fn(() => document.body.removeAttribute("data-expand-sidebar"));
const mountedCallback = { fn: undefined as (() => void) | undefined };
const hostMounted = vi.fn((fn: () => void) => { mountedCallback.fn = fn; });

function stubStudioHost() {
  vi.stubGlobal("useStudioHost", () => ({
    ui: { expandSidebar, collapseSidebar },
    on: { mounted: hostMounted },
  }));
}

const stubs = {
  AdminWorkspace: { props: ["title"], template: "<section><h1>{{ title }}</h1><slot /></section>" },
  UButton: { props: ["label", "icon"], template: "<button type='button'>{{ label }}</button>" },
};

beforeEach(() => {
  expandSidebar.mockClear();
  collapseSidebar.mockClear();
  hostMounted.mockClear();
  mountedCallback.fn = undefined;
  document.body.removeAttribute("data-expand-sidebar");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.removeAttribute("data-expand-sidebar");
});

describe("admin content editor entry", () => {
  it("expands after the login round-trip (?studio=open) once the host is ready", async () => {
    route.query = { studio: "open" };
    stubStudioHost();

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    expect(hostMounted).toHaveBeenCalledTimes(1);
    expect(expandSidebar).not.toHaveBeenCalled();

    // host.on.mounted fires when the editor is ready.
    mountedCallback.fn?.();
    await flushPromises();
    expect(expandSidebar).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("收起编辑器");

    wrapper.unmount();
    expect(collapseSidebar).toHaveBeenCalledTimes(1);
  });

  it("does not auto-open on a plain visit", async () => {
    route.query = {};
    stubStudioHost();

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    expect(expandSidebar).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("打开内容编辑器");
    wrapper.unmount();
  });

  it("opens in place when a session exists and routes through login otherwise", async () => {
    route.query = {};
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});

    // No session -> the button routes through the login round-trip.
    const wrapperNoSession = await mountSuspended(ContentPage, { global: { stubs } });
    await wrapperNoSession.get("button").trigger("click");
    expect(assign).toHaveBeenCalledWith("/api/studio/login?redirect=%2Fadmin%2Fcontent%3Fstudio%3Dopen");
    wrapperNoSession.unmount();

    // Session present -> the button opens the editor in place, then closes it.
    stubStudioHost();
    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(expandSidebar).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("收起编辑器");

    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(collapseSidebar).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("打开内容编辑器");
    wrapper.unmount();
  });
});
