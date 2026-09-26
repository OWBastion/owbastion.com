import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "./settings.vue";

const player = ref<{ player: { playerId: string; playerName: string; isAdmin: boolean }; recentSubmissions: never[] } | null>(null);
const refresh = vi.fn(async () => player.value);
mockNuxtImport("useCurrentPlayer", () => () => ({ player, status: ref("authenticated"), refresh }));

const stubs = {
  PlayerIdentityCard: { props: ["playerName", "playerId"], template: "<div>{{ playerName }}#{{ playerId }}</div>" },
  PlayerPasskeyManager: { template: "<div>Passkey 管理</div>" },
  USkeleton: true,
};

describe("personal settings page", () => {
  it("groups the account identity and login methods and links back to the player center", async () => {
    player.value = { player: { playerId: "1234", playerName: "Player", isAdmin: false }, recentSubmissions: [] };
    const wrapper = await mountSuspended(SettingsPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("个人设置");
    expect(wrapper.get('section[aria-labelledby="account-title"]').text()).toContain("Player#1234");
    expect(wrapper.get('section[aria-labelledby="login-title"]').text()).toContain("Passkey 管理");
    expect(wrapper.get('a[href="/me"]').text()).toContain("玩家中心");
  });

  it("shows a loading state instead of empty sections before the player is known", async () => {
    player.value = null;
    const wrapper = await mountSuspended(SettingsPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.find('section[aria-labelledby="account-title"]').exists()).toBe(false);
  });
});
