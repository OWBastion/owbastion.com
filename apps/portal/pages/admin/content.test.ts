import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContentPage from "./content.vue";

const route = { query: {} as Record<string, string> };
mockNuxtImport("useRoute", () => () => route);

const expandSidebar = vi.fn();
const collapseSidebar = vi.fn();

const stubs = {
  AdminWorkspace: { props: ["title"], template: "<section><h1>{{ title }}</h1><slot /></section>" },
  UButton: { props: ["label"], template: "<button type='button'>{{ label }}</button>" },
};

function stubStudioHost() {
  vi.stubGlobal("useStudioHost", () => ({ ui: { expandSidebar, collapseSidebar } }));
}

beforeEach(() => {
  expandSidebar.mockClear();
  collapseSidebar.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin content editor entry", () => {
  it("opens the Studio sidebar after the login round-trip (?studio=open) and closes it on leave", async () => {
    route.query = { studio: "open" };
    stubStudioHost();

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });

    expect(expandSidebar).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(collapseSidebar).toHaveBeenCalledTimes(1);
  });

  it("does not auto-open the editor on a plain visit", async () => {
    route.query = {};
    stubStudioHost();

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });

    expect(expandSidebar).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("routes the button through the Studio login round-trip with the open flag", async () => {
    route.query = {};
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    await wrapper.get("button").trigger("click");

    expect(assign).toHaveBeenCalledWith("/api/studio/login?redirect=%2Fadmin%2Fcontent%3Fstudio%3Dopen");
    wrapper.unmount();
  });
});
