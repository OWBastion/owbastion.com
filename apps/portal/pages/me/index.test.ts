import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import MePage from "./index.vue";

type Player = { player: { playerId: string; playerName: string; isAdmin: boolean }; recentSubmissions: never[] };
type Title = { grantId: string; titleKey: string; label: string; category: string; condition: string; scope: "global"; grantedAt: number };

const player = ref<Player | null>({
  player: { playerId: "1", playerName: "Player", isAdmin: false },
  recentSubmissions: [],
});
const titles = ref<Title[]>(Array.from({ length: 4 }, (_, index) => ({
  grantId: `grant-${index}`,
  titleKey: `TITLE-${index}`,
  label: `称号${index}`,
  category: "测试",
  condition: "完成挑战",
  scope: "global",
  grantedAt: 4 - index,
})));
const status = ref<"unknown" | "loading" | "authenticated" | "anonymous">("authenticated");
const refreshPlayer = vi.fn(async () => player.value);
const refreshTitles = vi.fn(async () => titles.value);
const masteryProfiles = ref([]);
const masteryLoading = ref(false);
const masteryError = ref("");
const refreshMastery = vi.fn(async () => ({ contractVersion: "1" as const, profiles: masteryProfiles.value, runs: [], page: 1, pageSize: 1, total: 0, hasMore: false }));
const passkeys = ref<unknown[]>([{ passkeyId: "passkey-1" }]);
const portalApi = vi.fn(async (path: string) => {
  if (path === "/v1/maps" || path === "/v1/challenges?family=map") return { items: [] };
  if (path === "/v1/me/passkeys") return { contractVersion: "1", items: passkeys.value, qqBound: true };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useCurrentPlayer", () => () => ({ player, status, refresh: refreshPlayer }));
mockNuxtImport("usePlayerTitles", () => () => ({ items: titles, refresh: refreshTitles }));
mockNuxtImport("usePlayerMastery", () => () => ({ profiles: masteryProfiles, overviewLoading: masteryLoading, overviewError: masteryError, refreshOverview: refreshMastery }));
mockNuxtImport("usePortalApi", () => () => portalApi);

async function mountPage(options?: { attachTo?: HTMLElement }): Promise<VueWrapper> {
  refreshPlayer.mockClear();
  refreshTitles.mockClear();
  refreshMastery.mockClear();
  masteryProfiles.value = [];
  masteryLoading.value = false;
  masteryError.value = "";
  const wrapper = await mountSuspended(MePage, {
    attachTo: options?.attachTo,
    global: {
      stubs: {
        StatusBadge: true,
        PlayerRecentSubmissions: { template: "<div>近期提交内容</div>" },
        MapProgressOverview: { template: "<div>地图进度内容</div>" },
        PageSectionHeader: { props: ["title", "eyebrow"], template: "<header><p v-if=\"eyebrow\">{{ eyebrow }}</p><h2>{{ title }}</h2><slot name=\"actions\" /></header>" },
        UButton: {
          props: ["to", "label", "loading"],
          emits: ["click"],
          template: '<a v-if="to" :href="to">{{ label }}</a><button v-else type="button" :disabled="loading" @click="$emit(\'click\')">{{ label }}</button>',
        },
        UAlert: {
          props: ["title", "description"],
          template: "<div role=\"alert\"><strong>{{ title }}</strong><p>{{ description }}</p><slot name=\"actions\" /></div>",
        },
        UEmpty: { props: ["title"], template: "<div>{{ title }}</div>" },
        USkeleton: { template: "<div class=\"skeleton\" />" },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("me page", () => {
  it("shows only the three most recently granted titles and links to achievements", async () => {
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    titles.value = [
      { grantId: "grant-old", titleKey: "TITLE-OLD", label: "旧称号", category: "测试", condition: "完成挑战", scope: "global" as const, grantedAt: 1 },
      { grantId: "grant-newest", titleKey: "TITLE-NEW", label: "最新称号", category: "测试", condition: "完成挑战", scope: "global" as const, grantedAt: 4 },
      { grantId: "grant-mid-b", titleKey: "TITLE-B", label: "中间称号乙", category: "测试", condition: "完成挑战", scope: "global" as const, grantedAt: 2 },
      { grantId: "grant-mid-a", titleKey: "TITLE-A", label: "中间称号甲", category: "测试", condition: "完成挑战", scope: "global" as const, grantedAt: 3 },
    ];
    status.value = "authenticated";
    refreshPlayer.mockResolvedValue(player.value);
    refreshTitles.mockResolvedValue(titles.value);

    const wrapper = await mountPage();
    const recentTitles = wrapper.get('section[aria-labelledby="titles-title"]');
    expect(recentTitles.findAll("strong").map((item) => item.text())).toEqual(["最新称号", "中间称号甲", "中间称号乙"]);
    expect(wrapper.get('a[href="/achievements"]').text()).toContain("查看全部成就");
    expect(wrapper.text()).not.toContain("更多功能");
  });

  it("shows a successful empty title state without treating it as an error", async () => {
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    titles.value = [];
    status.value = "authenticated";
    refreshPlayer.mockResolvedValue(player.value);
    refreshTitles.mockResolvedValue([]);

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("暂无称号");
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
    expect(wrapper.text()).toContain("你好，Player");
  });

  it("keeps player content visible when title loading fails and supports retry", async () => {
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    titles.value = [];
    status.value = "authenticated";
    refreshPlayer.mockResolvedValue(player.value);
    refreshTitles.mockRejectedValueOnce(new Error("titles unavailable"));

    const wrapper = await mountPage();
    expect(wrapper.text()).toContain("你好，Player");
    expect(wrapper.text()).toContain("近期提交内容");
    expect(wrapper.text()).toContain("无法读取称号");
    expect(wrapper.text()).not.toContain("暂无称号");
    expect(wrapper.text()).not.toContain("旧称号");

    titles.value = [{ grantId: "grant-1", titleKey: "TITLE-1", label: "称号1", category: "测试", condition: "完成挑战", scope: "global", grantedAt: 1 }];
    refreshTitles.mockResolvedValueOnce(titles.value);
    const retry = wrapper.findAll("button").find((button) => button.text() === "重试");
    expect(retry).toBeDefined();
    await retry!.trigger("click");
    await flushPromises();
    expect(wrapper.get('section[aria-labelledby="titles-title"]').text()).toContain("称号1");
    expect(wrapper.text()).not.toContain("无法读取称号");
  });

  it("settles loading and shows a full-page error with retry when player data is unavailable", async () => {
    player.value = null;
    status.value = "unknown";
    refreshPlayer.mockRejectedValueOnce(new Error("player unavailable"));
    refreshTitles.mockRejectedValueOnce(new Error("titles unavailable"));

    const wrapper = await mountPage();
    expect(wrapper.find('[role="status"][aria-label="读取中…"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("无法读取玩家信息");
    expect(wrapper.text()).toContain("重试");

    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    titles.value = [];
    status.value = "authenticated";
    refreshPlayer.mockResolvedValueOnce(player.value);
    refreshTitles.mockResolvedValueOnce([]);
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("你好，Player");
    expect(wrapper.text()).toContain("暂无称号");
  });

  it("links to personal settings and offers a dismissible Passkey reminder only when none is registered", async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } });
    player.value = { player: { playerId: "1", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    status.value = "authenticated";
    refreshPlayer.mockResolvedValue(player.value);
    refreshTitles.mockResolvedValue(titles.value);

    passkeys.value = [{ passkeyId: "passkey-1" }];
    let wrapper = await mountPage();
    expect(wrapper.get('a[href="/me/settings"]').text()).toContain("个人设置");
    expect(wrapper.text()).not.toContain("添加 Passkey，下次一键登录");

    passkeys.value = [];
    wrapper = await mountPage();
    expect(wrapper.text()).toContain("添加 Passkey，下次一键登录");
    await wrapper.findAll("button").find((button) => button.text() === "不再提醒")!.trigger("click");
    expect(wrapper.text()).not.toContain("添加 Passkey，下次一键登录");
    expect(stored.get("owbastion-passkey-nudge-dismissed")).toBe("1");

    wrapper = await mountPage();
    expect(wrapper.text()).not.toContain("添加 Passkey，下次一键登录");
    vi.unstubAllGlobals();
  });

  it("distinguishes a missing session from loading and read failure", async () => {
    player.value = null;
    status.value = "anonymous";
    refreshPlayer.mockResolvedValueOnce(null);
    refreshTitles.mockResolvedValueOnce([]);

    const wrapper = await mountPage();
    expect(wrapper.find('[role="status"][aria-label="读取中…"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("需要登录");
    expect(wrapper.text()).not.toContain("无法读取玩家信息");
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true);
  });
});
