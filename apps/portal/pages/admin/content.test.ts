import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
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
const routeGuard = { fn: undefined as ((to: { path: string; fullPath?: string }, from: { path: string }) => Promise<boolean | void> | boolean | void) | undefined };
const beforeEachRoute = vi.fn((guard: typeof routeGuard.fn) => {
  routeGuard.fn = guard;
  return () => { routeGuard.fn = undefined; };
});
const callHook = vi.fn(async () => undefined);
const { toastAdd, navigateToMock } = vi.hoisted(() => ({
  toastAdd: vi.fn(),
  navigateToMock: vi.fn(() => Promise.resolve()),
}));
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));
mockNuxtImport("navigateTo", () => navigateToMock);

function stubStudioHost() {
  vi.stubGlobal("useStudioHost", () => ({
    ui: { activateStudio, deactivateStudio, expandSidebar, collapseSidebar },
    document: { db: { list: async () => [{ fsPath: "apps/portal/content/changelog/0801.1.md", path: "/changelog/26.0801.1" }] } },
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
  routeGuard.fn = undefined;
  beforeEachRoute.mockClear();
  callHook.mockClear();
  toastAdd.mockClear();
  navigateToMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("useNuxtApp", () => ({ $router: { beforeEach: beforeEachRoute }, callHook }));
  document.body.removeAttribute("data-expand-sidebar");
  document.body.removeAttribute("data-studio-active");
  document.querySelector("nuxt-studio")?.remove();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.removeAttribute("data-expand-sidebar");
  document.body.removeAttribute("data-studio-active");
});

describe("admin content editor workspace", () => {
  it("opens the existing Studio session when entering the workspace", async () => {
    stubStudioHost();

    const wrapper = await mountSuspended(ContentPage, { attachTo: document.body, global: { stubs } });
    document.body.appendChild(document.createElement("nuxt-studio"));
    await flushPromises();
    expect(hostMounted).toHaveBeenCalledTimes(1);
    expect(activateStudio).toHaveBeenCalledTimes(1);
    expect(expandSidebar).toHaveBeenCalledTimes(1);

    mountedCallback.fn?.();
    await flushPromises();
    expect(expandSidebar).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("内容工作区");
    expect(wrapper.text()).toContain("编辑器已打开");
    expect(wrapper.text()).toContain("关闭编辑器");

    expect(await routeGuard.fn?.({ path: "/changelog/26.0801.1", fullPath: "/changelog/26.0801.1" }, { path: "/admin/content" })).toBe(false);
    expect(callHook).toHaveBeenCalledWith("studio:document:edit", "apps/portal/content/changelog/0801.1.md");
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "已在编辑器中打开该文档" }));

    // The interception reports itself and offers an explicit preview escape.
    const previewAction = toastAdd.mock.calls[0]?.[0]?.actions?.[0];
    expect(previewAction?.label).toBe("在页面中预览");
    previewAction?.onClick?.();
    expect(navigateToMock).toHaveBeenCalledWith("/changelog/26.0801.1");
    expect(await routeGuard.fn?.({ path: "/changelog/26.0801.1", fullPath: "/changelog/26.0801.1" }, { path: "/admin/content" })).toBeUndefined();

    await wrapper.get("button").trigger("click");
    expect(deactivateStudio).toHaveBeenCalled();
    expect(wrapper.text()).toContain("编辑器未打开");

    wrapper.unmount();
    expect(collapseSidebar).toHaveBeenCalled();
  });

  it("routes through the same-origin Studio login when no session exists", async () => {
    fetchMock.mockResolvedValue(sessionResponse({}));
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});

    const wrapper = await mountSuspended(ContentPage, { attachTo: document.body, global: { stubs } });
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
    const wrapper = await mountSuspended(ContentPage, { attachTo: document.body, global: { stubs } });
    document.body.appendChild(document.createElement("nuxt-studio"));
    await flushPromises();
    mountedCallback.fn?.();
    await flushPromises();

    document.body.removeAttribute("data-expand-sidebar");
    await flushPromises();
    expect(wrapper.text()).toContain("编辑器未打开");
    expect(wrapper.text()).toContain("打开内容编辑器");
    expect(deactivateStudio).toHaveBeenCalledTimes(1);

    await wrapper.get("button").trigger("click");
    mountedCallback.fn?.();
    await flushPromises();
    expect(expandSidebar.mock.calls.length).toBeGreaterThan(2);
    wrapper.unmount();
  });

  it("keeps a failed session request actionable", async () => {
    fetchMock.mockResolvedValue(sessionResponse({ error: "unavailable" }, 503));

    const wrapper = await mountSuspended(ContentPage, { attachTo: document.body, global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain("内容编辑器暂时无法载入");
    expect(wrapper.text()).toContain("重新载入编辑器");
    wrapper.unmount();
  });
});
