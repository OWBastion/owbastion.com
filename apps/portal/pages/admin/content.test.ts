import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContentPage from "./content.vue";

const expandSidebar = vi.fn(() => document.body.setAttribute("data-expand-sidebar", "true"));
const collapseSidebar = vi.fn(() => document.body.removeAttribute("data-expand-sidebar"));
const activateStudio = vi.fn(() => document.body.setAttribute("data-studio-active", "true"));
const deactivateStudio = vi.fn(() => {
  document.body.removeAttribute("data-studio-active");
  collapseSidebar();
});
const mountedCallback = { fn: undefined as (() => void) | undefined };
const hostMounted = vi.fn((fn: () => void) => { mountedCallback.fn = fn; });
const fetchMock = vi.fn<typeof fetch>();

function stubStudioHost() {
  vi.stubGlobal("useStudioHost", () => ({
    ui: { activateStudio, deactivateStudio, expandSidebar, collapseSidebar },
    on: { mounted: hostMounted },
  }));
}

function sessionResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const stubs = {
  AdminWorkspace: { props: ["title"], template: "<section><h1>{{ title }}</h1><slot name='actions' /><slot /></section>" },
  UButton: {
    props: ["label", "icon", "to", "size", "color", "variant"],
    template: "<a v-if='to' :href='to'>{{ label }}</a><button v-else type='button' @click='$emit(\"click\")'>{{ label }}</button>",
  },
};

beforeEach(() => {
  expandSidebar.mockClear();
  collapseSidebar.mockClear();
  activateStudio.mockClear();
  deactivateStudio.mockClear();
  hostMounted.mockClear();
  mountedCallback.fn = undefined;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.body.removeAttribute("data-expand-sidebar");
  document.body.removeAttribute("data-studio-active");
  document.body.removeAttribute("data-studio-fullscreen");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.removeAttribute("data-expand-sidebar");
  document.body.removeAttribute("data-studio-active");
  document.body.removeAttribute("data-studio-fullscreen");
});

describe("admin content editor workspace", () => {
  it("opens the existing Studio session when entering the workspace", async () => {
    stubStudioHost();

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    const appRoot = document.getElementById("__nuxt");
    expect(appRoot).not.toBeNull();
    expect(hostMounted).toHaveBeenCalledTimes(1);
    expect(activateStudio).toHaveBeenCalledTimes(1);
    expect(expandSidebar).not.toHaveBeenCalled();

    mountedCallback.fn?.();
    await flushPromises();
    expect(expandSidebar).toHaveBeenCalledTimes(1);
    expect(document.body.getAttribute("data-studio-fullscreen")).toBe("true");
    expect(appRoot?.hasAttribute("inert")).toBe(true);
    expect(appRoot?.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.text()).toContain("内容编辑器已打开");

    wrapper.unmount();
    expect(deactivateStudio).toHaveBeenCalledTimes(1);
    expect(collapseSidebar).toHaveBeenCalledTimes(1);
    expect(document.body.hasAttribute("data-studio-fullscreen")).toBe(false);
    expect(appRoot?.hasAttribute("inert")).toBe(false);
  });

  it("routes through the same-origin Studio login when no session exists", async () => {
    fetchMock.mockResolvedValue(sessionResponse({}));
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/__nuxt_studio/auth/session", {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    expect(assign).toHaveBeenCalledWith("/api/studio/login?redirect=%2Fadmin%2Fcontent");
    expect(wrapper.text()).toContain("正在载入内容编辑器");
    wrapper.unmount();
  });

  it("returns to a compact recovery state when the editor closes", async () => {
    stubStudioHost();
    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    const appRoot = document.getElementById("__nuxt");
    expect(appRoot).not.toBeNull();
    mountedCallback.fn?.();
    await flushPromises();

    document.body.removeAttribute("data-expand-sidebar");
    await flushPromises();
    expect(wrapper.text()).toContain("内容编辑器未打开");
    expect(wrapper.text()).toContain("打开内容编辑器");
    expect(document.body.hasAttribute("data-studio-fullscreen")).toBe(false);
    expect(appRoot?.hasAttribute("inert")).toBe(false);
    expect(deactivateStudio).toHaveBeenCalledTimes(1);

    await wrapper.get("button").trigger("click");
    mountedCallback.fn?.();
    await flushPromises();
    expect(expandSidebar).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("keeps a failed session request actionable", async () => {
    fetchMock.mockResolvedValue(sessionResponse({ error: "unavailable" }, 503));

    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain("内容编辑器无法载入");
    expect(wrapper.text()).toContain("重新载入编辑器");
    wrapper.unmount();
  });
});
