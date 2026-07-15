<script setup lang="ts">
const { player, loaded, refresh, logout } = useCurrentPlayer();
const loggingOut = ref(false);
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const route = useRoute();
const isAdminPage = computed(() => route.path.startsWith("/admin"));

onMounted(() => { if (!loaded.value) void refresh(); });

function closeMenu(returnFocus = false) {
  menuOpen.value = false;
  if (returnFocus) nextTick(() => menuButton.value?.focus());
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) nextTick(() => menuPanel.value?.querySelector<HTMLAnchorElement>("a")?.focus());
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (menuOpen.value && !(event.target instanceof Node && menuPanel.value?.parentElement?.contains(event.target))) closeMenu();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && menuOpen.value) closeMenu(true);
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
});

async function signOut() {
  loggingOut.value = true;
  try {
    await logout();
    await navigateTo("/");
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <header class="app-header-wrap">
    <div class="app-header">
      <NuxtLink to="/" class="brand" aria-label="躲避堡垒 3 首页"><span class="brand-mark" aria-hidden="true">O</span><span>躲避堡垒 3</span></NuxtLink>
      <nav class="main-nav" :aria-label="isAdminPage ? '管理导航' : '主导航'"><template v-if="isAdminPage"><NuxtLink to="/admin">管理后台</NuxtLink><NuxtLink to="/admin/titles">称号迁移</NuxtLink></template><template v-else><NuxtLink to="/#events">事件</NuxtLink><NuxtLink to="/achievements">成就</NuxtLink><NuxtLink to="/#rankings">天梯排名</NuxtLink><NuxtLink to="/#rotation">轮换挑战</NuxtLink></template></nav>
      <div class="account-actions">
        <ThemeMenu />
        <AccountMenu v-if="player" :player="player.player" @logout="signOut" />
        <NuxtLink v-else to="/login" class="login-link">登录</NuxtLink>
      </div>
      <button ref="menuButton" class="mobile-menu-toggle" type="button" :aria-label="menuOpen ? '关闭菜单' : '打开菜单'" :aria-expanded="menuOpen" aria-controls="mobile-nav" @click="toggleMenu"><svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="!menuOpen" d="M4 7h16M4 12h16M4 17h16" /><path v-else d="M6 6l12 12M18 6L6 18" /></svg></button>
      <nav v-show="menuOpen" id="mobile-nav" ref="menuPanel" class="mobile-nav" :aria-label="isAdminPage ? '移动端管理导航' : '移动端主导航'"><template v-if="isAdminPage"><NuxtLink to="/admin" @click="closeMenu()">管理后台</NuxtLink><NuxtLink to="/admin/titles" @click="closeMenu()">称号迁移</NuxtLink></template><template v-else><NuxtLink to="/#events" @click="closeMenu()">事件</NuxtLink><NuxtLink to="/achievements" @click="closeMenu()">成就</NuxtLink><NuxtLink to="/#rankings" @click="closeMenu()">天梯排名</NuxtLink><NuxtLink to="/#rotation" @click="closeMenu()">轮换挑战</NuxtLink></template></nav>
    </div>
  </header>
</template>

<style scoped>
.app-header-wrap { position: sticky; z-index: 10; top: 14px; width: min(100% - 28px, 1280px); margin: 0 auto; }
.app-header { display: flex; align-items: center; gap: 28px; min-height: 54px; padding: 0 16px 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--header-surface); box-shadow: 0 3px 10px -6px var(--shadow); }
.brand { display: inline-flex; min-width: 0; align-items: center; gap: 9px; color: var(--text); font-size: .9rem; font-weight: 650; letter-spacing: -.025em; text-decoration: none; white-space: nowrap; }
.brand > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.brand-mark { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; color: var(--on-accent); background: var(--accent); font-size: .92rem; font-weight: 760; }
.main-nav { display: flex; flex: 1; justify-content: flex-start; gap: clamp(16px, 2.6vw, 34px); color: var(--muted); font-size: .78rem; }
.main-nav a { text-decoration: none; transition: color 160ms ease; }
.main-nav a:hover { color: var(--text); }
.account-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 14px; font-size: .78rem; font-weight: 650; }
.login-link { min-height: 34px; padding: 8px 11px; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: var(--surface-raised); text-decoration: none; transition: transform 100ms ease-out, background 160ms ease; }
.login-link:active { transform: scale(.97); }
.mobile-menu-toggle, .mobile-nav { display: none; }
@media (max-width: 760px) {
  .app-header-wrap { top: max(8px, env(safe-area-inset-top)); }
  .app-header { position: relative; gap: 10px; min-height: 52px; padding: 6px 8px 6px 10px; }
  .main-nav { display: none; }
  .mobile-menu-toggle { display: inline-grid; flex: 0 0 40px; width: 40px; height: 40px; place-items: center; padding: 0; border: 1px solid var(--line-strong); border-radius: 9px; color: var(--text); background: var(--surface-raised); }
  .mobile-menu-toggle svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
  .mobile-nav { position: absolute; z-index: 2; inset: calc(100% + 8px) 0 auto; display: grid; gap: 3px; padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--menu-surface); box-shadow: 0 8px 18px -8px var(--shadow); }
  .mobile-nav a { display: flex; min-height: 44px; align-items: center; padding: 0 12px; border-radius: 8px; color: var(--muted); text-decoration: none; }
  .mobile-nav a:hover, .mobile-nav a:focus-visible { color: var(--text); background: var(--surface); }
}
@media (max-width: 380px) { .app-header { gap: 6px; }.account-actions { gap: 8px; }.brand { gap: 7px; font-size: .82rem; }.brand-mark { width: 26px; height: 26px; } }
</style>
