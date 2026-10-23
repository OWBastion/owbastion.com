import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { describe, expect, it } from "vitest";
import AppHeader from "./AppHeader.vue";

const route = reactive({ path: "/admin", fullPath: "/admin", query: {} as Record<string, string> });
mockNuxtImport("useRoute", () => () => route);
const currentPlayer = ref<unknown>(null);
mockNuxtImport("useCurrentPlayer", () => () => ({ player: currentPlayer, loaded: ref(true), refresh: async () => null, logout: async () => undefined }));

// Overlay behavior (focus trap, Escape, scrim, scroll lock, focus return) belongs to USlideover; the stub only exposes open state.
const slideoverStub = { props: ["open"], emits: ["update:open"], template: '<div><span @click="$emit(\'update:open\', !open)"><slot /></span><div v-if="open"><slot name="body" /></div></div>' };

async function mountHeader() {
  return mountSuspended(AppHeader, {
    global: {
      stubs: {
        USlideover: slideoverStub,
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
    for (const group of ["内容", "称号运营", "审核", "玩家"]) expect(wrapper.text()).toContain(group);
    expect(wrapper.text()).not.toContain("更多");
    expect(wrapper.text()).not.toContain("待处理");
    expect(wrapper.text()).not.toContain("内容编辑");
    expect(wrapper.text()).not.toContain("天梯排名");

    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    expect(wrapper.get("#mobile-nav").attributes("aria-label")).toBe("移动端管理导航");
  });

  it("expands nested admin groups without closing the mobile panel", async () => {
    route.path = "/admin";
    route.fullPath = "/admin";
    const wrapper = await mountHeader();
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    await flushPromises();

    const nav = wrapper.get("#mobile-nav");
    const groups: Record<string, string[]> = {
      内容: ["/admin/maps", "/admin/events", "/admin/achievements/titles"],
      称号运营: ["/admin/grants", "/admin/title-migration"],
      审核: ["/admin/reviews", "/admin/screenshot-sets", "/admin/player-reviews", "/admin/verified-runs"],
      玩家: ["/admin/players", "/admin/bindings", "/admin/channels"],
    };
    for (const [label, targets] of Object.entries(groups)) {
      const trigger = nav.findAll("button").find((button) => button.text().includes(label));
      expect(trigger, label).toBeTruthy();
      await trigger!.trigger("click");
      await flushPromises();
      expect(wrapper.find("#mobile-nav").exists()).toBe(true);
      for (const target of targets) expect(nav.find(`a[href="${target}"]`).exists(), target).toBe(true);
    }

    await nav.get("a[href=\"/admin/bindings\"]").trigger("click");
    await flushPromises();
    expect(wrapper.find("#mobile-nav").exists()).toBe(false);
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
  });

  it("exposes one concise update route on public navigation", async () => {
    currentPlayer.value = null;
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();

    expect(wrapper.findAll('nav[aria-label="主导航"] a').filter((link) => link.text() === "版本更新")).toHaveLength(1);
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    expect(wrapper.findAll("#mobile-nav a").filter((link) => link.text() === "版本更新")).toHaveLength(1);
    expect(wrapper.find("#mobile-nav a[href=\"/changelog\"]").exists()).toBe(true);
  });
});

describe("AppHeader admin navigation ownership", () => {
  async function openMobileNav(path: string, query: Record<string, string> = {}) {
    route.path = path;
    route.fullPath = path;
    route.query = query;
    const wrapper = await mountHeader();
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    await flushPromises();
    return wrapper.get("#mobile-nav");
  }

  it.each([
    ["/admin/achievements/map-challenges", "/admin/achievements/titles", ["/admin/maps", "/admin/events"]],
    ["/admin/title-migration", "/admin/title-migration", ["/admin/grants"]],
    ["/admin/verified-runs", "/admin/verified-runs", ["/admin/reviews", "/admin/player-reviews"]],
    ["/admin/channels", "/admin/channels", ["/admin/players", "/admin/bindings"]],
  ])("expands the group that owns %s", async (path, entry, siblings) => {
    const nav = await openMobileNav(path);
    expect(nav.find(`a[href="${entry}"]`).exists(), entry).toBe(true);
    for (const sibling of siblings) expect(nav.find(`a[href="${sibling}"]`).exists(), sibling).toBe(true);
  });

  it("keeps a single bindings entry regardless of tab query", async () => {
    const nav = await openMobileNav("/admin/bindings", { tab: "invitations" });
    expect(nav.findAll('a[href^="/admin/bindings"]')).toHaveLength(1);
  });
});

describe("AppHeader site navigation by sign-in state", () => {
  const introduction = ["/events", "/maps", "/achievements", "/changelog", "/blog"];

  it("shows only the introduction pages to a signed-out visitor", async () => {
    currentPlayer.value = null;
    route.path = "/";
    route.fullPath = "/";
    const wrapper = await mountHeader();
    const nav = wrapper.get('nav[aria-label="主导航"]');
    for (const target of introduction) expect(nav.find(`a[href="${target}"]`).exists(), target).toBe(true);
    for (const target of ["/me", "/me/achievements", "/me/submissions/new"]) expect(nav.find(`a[href="${target}"]`).exists(), target).toBe(false);
  });

  it("lists a signed-in player's personal URLs and the introduction pages flat, without a submenu", async () => {
    currentPlayer.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    route.path = "/me";
    route.fullPath = "/me";
    const wrapper = await mountHeader();
    await wrapper.get('button[aria-label="打开菜单"]').trigger("click");
    await flushPromises();
    const nav = wrapper.get("#mobile-nav");
    for (const target of ["/me", "/me/achievements", "/me/submissions/new", ...introduction]) expect(nav.find(`a[href="${target}"]`).exists(), target).toBe(true);
    expect(nav.text()).not.toContain("游戏介绍");
    currentPlayer.value = null;
  });

  it("marks the current page in both navigation sets", async () => {
    // Nuxt UI renders each item as <a><button>; the button carries the real current-page state.
    const isCurrent = (wrapper: Awaited<ReturnType<typeof mountHeader>>, href: string) =>
      wrapper.get(`nav[aria-label="主导航"] a[href="${href}"] button`).attributes("aria-current") === "page";

    currentPlayer.value = null;
    route.path = "/maps";
    route.fullPath = "/maps";
    const signedOut = await mountHeader();
    expect(isCurrent(signedOut, "/maps")).toBe(true);
    expect(isCurrent(signedOut, "/events")).toBe(false);

    currentPlayer.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    route.path = "/me/achievements/maps/map.a";
    route.fullPath = "/me/achievements/maps/map.a";
    const signedIn = await mountHeader();
    expect(isCurrent(signedIn, "/me/achievements")).toBe(true);
    expect(isCurrent(signedIn, "/me")).toBe(false);
    currentPlayer.value = null;
  });
});
