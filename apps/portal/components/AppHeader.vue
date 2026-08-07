<script setup lang="ts">
const { player, loaded, refresh, logout } = useCurrentPlayer();
const loggingOut = ref(false);
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const route = useRoute();
const isAdminPage = computed(() => route.path.startsWith("/admin"));
const adminNavigationItems = [
  { label: "概览", icon: "i-lucide-layout-dashboard", to: "/admin" },
  { label: "玩家", icon: "i-lucide-users", to: "/admin/players" },
  { label: "绑定", icon: "i-lucide-link", to: "/admin/bindings" },
  {
    label: "成就与称号",
    icon: "i-lucide-trophy",
    children: [
      { label: "审核", description: "截图审核队列", icon: "i-lucide-clipboard-check", to: "/admin/reviews" },
      { label: "评价", description: "玩家评价审核", icon: "i-lucide-message-square-quote", to: "/admin/player-reviews" },
      { label: "成就与称号", description: "成就、地图规则与称号目录", icon: "i-lucide-settings-2", to: "/admin/achievements" },
      { label: "历史称号", description: "历史数据与称号关联", icon: "i-lucide-history", to: "/admin/titles" },
    ],
  },
  { label: "地图", icon: "i-lucide-map", to: "/admin/maps" },
  { label: "事件", icon: "i-lucide-zap", to: "/admin/events" },
  { label: "渠道", icon: "i-lucide-radio", to: "/admin/channels" },
];

onMounted(() => { if (!loaded.value) void refresh(); });

/** Disclosure close. Only restore focus when the menu was closed while focus was inside the panel. */
function closeMenu(returnFocus = false) {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  if (returnFocus) nextTick(() => menuButton.value?.focus());
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  const root = menuButton.value?.parentElement;
  if (root?.contains(target)) return;
  closeMenu(false);
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !menuOpen.value) return;
  // Escape always closes; restore focus to the trigger so keyboard users leave the disclosure predictably.
  closeMenu(true);
}

watch(() => route.fullPath, () => {
  if (menuOpen.value) closeMenu(false);
});

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
  <header class="app-header-wrap scroll-edge">
    <div class="app-header glass elevation-1">
      <NuxtLink to="/" class="brand pressable" aria-label="躲避堡垒 3 首页">
        <span class="brand-mark" aria-hidden="true">O</span>
        <span>躲避堡垒 3</span>
      </NuxtLink>
      <nav class="main-nav" :aria-label="isAdminPage ? '管理导航' : '主导航'">
        <template v-if="isAdminPage">
          <LazyUNavigationMenu :items="adminNavigationItems" orientation="horizontal" highlight variant="pill" />
        </template>
        <template v-else>
          <NuxtLink to="/events" class="pressable">事件</NuxtLink>
          <NuxtLink to="/maps" class="pressable">地图</NuxtLink>
          <NuxtLink to="/achievements" class="pressable">成就</NuxtLink>
          <NuxtLink to="/#rankings" class="hash-nav-link pressable">天梯排名</NuxtLink>
          <NuxtLink to="/#rotation" class="hash-nav-link pressable">轮换挑战</NuxtLink>
        </template>
      </nav>
      <div class="account-actions">
        <ThemeMenu />
        <LazyAccountMenu v-if="player" :player="player.player" @logout="signOut" />
        <NuxtLink v-else to="/login" class="login-link pressable">登录</NuxtLink>
      </div>
      <button
        ref="menuButton"
        class="mobile-menu-toggle pressable"
        type="button"
        :aria-label="menuOpen ? '关闭菜单' : '打开菜单'"
        :aria-expanded="menuOpen"
        aria-controls="mobile-nav"
        @click="toggleMenu"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="!menuOpen" d="M4 7h16M4 12h16M4 17h16" />
          <path v-else d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <!-- No mode="out-in": leave can be interrupted mid-flight when reopening. -->
      <Transition name="mobile-nav">
        <nav
          v-if="menuOpen"
          id="mobile-nav"
          ref="menuPanel"
          class="mobile-nav glass-heavy elevation-2"
          :aria-label="isAdminPage ? '移动端管理导航' : '移动端主导航'"
        >
          <template v-if="isAdminPage">
            <LazyUNavigationMenu :items="adminNavigationItems" orientation="vertical" highlight variant="pill" @click="closeMenu()" />
          </template>
          <template v-else>
            <NuxtLink to="/events" class="pressable" @click="closeMenu()">事件</NuxtLink>
            <NuxtLink to="/maps" class="pressable" @click="closeMenu()">地图</NuxtLink>
            <NuxtLink to="/achievements" class="pressable" @click="closeMenu()">成就</NuxtLink>
            <NuxtLink to="/#rankings" class="hash-nav-link pressable" @click="closeMenu()">天梯排名</NuxtLink>
            <NuxtLink to="/#rotation" class="hash-nav-link pressable" @click="closeMenu()">轮换挑战</NuxtLink>
          </template>
        </nav>
      </Transition>
    </div>
  </header>
</template>

<style scoped>
.app-header-wrap { position: sticky; z-index: 10; top: 14px; width: min(100% - 28px, 1480px); margin: 0 auto; }
.app-header { display: flex; align-items: center; gap: 28px; min-height: 54px; padding: 0 16px 0 12px; border: 1px solid var(--line); border-radius: 12px; }
.brand { display: inline-flex; min-width: 0; align-items: center; gap: 9px; color: var(--text); font-size: .9rem; font-weight: 650; letter-spacing: -.025em; text-decoration: none; white-space: nowrap; }
.brand > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.brand-mark { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; color: var(--on-accent); background: var(--accent); font-size: .92rem; font-weight: 760; }
.main-nav { display: flex; flex: 1; min-width: 0; align-items: center; justify-content: flex-start; gap: 3px; color: var(--text-on-glass-secondary); font-size: .78rem; font-weight: 650; }
.main-nav :deep(ul) { gap: 2px; }
.main-nav :deep([data-slot="link"]), .main-nav :deep([data-slot="trigger"]) { min-height: 40px; border-radius: 9px; font-size: .78rem; font-weight: 650; color: var(--text-on-glass-secondary); }
.main-nav a {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  padding: 0 11px;
  border-radius: 9px;
  color: var(--text-on-glass-secondary);
  text-decoration: none;
  white-space: nowrap;
  transition: color 160ms ease, background 160ms ease;
}
.main-nav a:hover, .main-nav a:focus-visible, .main-nav a.router-link-exact-active:not(.hash-nav-link),
.main-nav :deep([data-slot="link"]:hover), .main-nav :deep([data-slot="link"]:focus-visible),
.main-nav :deep([data-slot="trigger"]:hover), .main-nav :deep([data-slot="trigger"]:focus-visible),
.main-nav :deep([data-active="true"]) {
  color: var(--text-on-glass);
  background: color-mix(in oklch, var(--surface-raised) 72%, transparent);
}
.account-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; font-size: .78rem; font-weight: 650; }
.login-link { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: var(--surface-raised); text-decoration: none; }
.mobile-menu-toggle, .mobile-nav { display: none; }
@media (max-width: 900px) {
  .app-header-wrap { top: max(8px, env(safe-area-inset-top)); }
  .app-header { position: relative; gap: 10px; min-height: 52px; padding: 6px 8px 6px 10px; }
  .main-nav { display: none; }
  .account-actions { margin-left: auto; }
  .login-link { min-height: 44px; }
  .mobile-menu-toggle {
    display: inline-grid;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    place-items: center;
    padding: 0;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    color: var(--text);
    background: var(--surface-raised);
  }
  .mobile-menu-toggle svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
  .mobile-nav {
    position: absolute;
    z-index: 2;
    inset: calc(100% + 8px) 0 auto;
    display: grid;
    gap: 3px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 14px;
    transform-origin: top center;
  }
  .mobile-nav a {
    display: flex;
    min-height: 44px;
    align-items: center;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--text-on-glass-secondary);
    font-weight: 650;
    text-decoration: none;
    transition: color 160ms ease, background 160ms ease;
  }
  .mobile-nav a:hover,
  .mobile-nav a:focus-visible,
  .mobile-nav a.router-link-exact-active:not(.hash-nav-link) {
    color: var(--text-on-glass);
    background: var(--surface);
  }
  .mobile-nav :deep(ul) { display: grid; gap: 3px; }
  .mobile-nav :deep([data-slot="link"]),
  .mobile-nav :deep([data-slot="trigger"]) {
    min-height: 44px;
    border-radius: 8px;
    color: var(--text-on-glass-secondary);
    font-weight: 650;
  }
  .mobile-nav :deep([data-slot="link"]:hover),
  .mobile-nav :deep([data-active="true"]) {
    color: var(--text-on-glass);
  }
}
/* Symmetric enter/leave; no spatial transform under reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .mobile-nav-enter-active {
    transition: opacity 160ms ease, transform 160ms cubic-bezier(.2, .7, .2, 1);
  }
  .mobile-nav-leave-active {
    transition: opacity 140ms ease, transform 140ms cubic-bezier(.8, 0, .8, .3);
  }
  .mobile-nav-enter-from,
  .mobile-nav-leave-to {
    opacity: 0;
    transform: translateY(-6px) scale(.98);
  }
  .mobile-nav-enter-to,
  .mobile-nav-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .mobile-nav-enter-active,
  .mobile-nav-leave-active {
    transition: opacity 150ms ease;
  }
  .mobile-nav-enter-from,
  .mobile-nav-leave-to {
    opacity: 0;
    transform: none;
  }
}
@media (max-width: 380px) {
  .app-header { gap: 6px; }
  .account-actions { gap: 8px; }
  .brand { gap: 7px; font-size: .82rem; }
  .brand-mark { width: 26px; height: 26px; }
}
@media (prefers-reduced-transparency: reduce) {
  .mobile-nav { background: var(--surface); }
}
@media (prefers-contrast: more) {
  .mobile-menu-toggle,
  .mobile-nav,
  .login-link { border-color: var(--text); }
}
</style>
