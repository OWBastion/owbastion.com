<script setup lang="ts">
import { introductionPages } from "~/utils/introduction-pages";
import { adminPathActive, adminSectionGroups } from "~/utils/admin-sections";

const { player, loaded, refresh, logout } = useCurrentPlayer();
const loggingOut = ref(false);
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const route = useRoute();
const menuFocusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function menuFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(menuFocusableSelector))
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}
const isAdminPage = computed(() => route.path.startsWith("/admin"));
const adminNavigationItems = computed(() => [
  { label: "总览", icon: "i-lucide-layout-dashboard", to: "/admin", active: route.path === "/admin" },
  ...adminSectionGroups.map((group) => {
    const children = group.sections.map((section) => ({ ...section, active: adminPathActive(route.path, section.to) }));
    const active = children.some((child) => child.active);
    return { label: group.label, icon: group.icon, active, defaultOpen: active, children };
  }),
]);

const pathActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`);
// Signed-out visitors see the public introduction pages. Signed-in players default to their own
// URLs; the introduction pages stay reachable under one group and by direct URL.
const siteNavigationItems = computed(() => {
  if (!player.value) return introductionPages.map((page) => ({ ...page, active: pathActive(page.to) }));
  const introActive = introductionPages.some((page) => pathActive(page.to));
  return [
    { label: "总览", icon: "i-lucide-layout-dashboard", to: "/me", active: route.path === "/me" },
    { label: "我的成就", icon: "i-lucide-award", to: "/me/achievements", active: pathActive("/me/achievements") },
    { label: "提交截图", icon: "i-lucide-upload", to: "/me/submissions/new", active: pathActive("/me/submissions") },
    // The leaderboard is promoted out of the introduction group for players:
    // checking one's own standing is a primary action, not site browsing.
    { label: "排行榜", icon: "i-lucide-trophy", to: "/leaderboard", active: pathActive("/leaderboard") },
    {
      label: "游戏介绍",
      icon: "i-lucide-book-open",
      active: introActive,
      defaultOpen: introActive,
      children: introductionPages.filter((page) => page.to !== "/leaderboard").map((page) => ({ ...page, active: pathActive(page.to) })),
    },
  ];
});

// Phone tab bar: the four destinations a visitor or player reaches most; everything else stays in the menu.
const tabItems = computed(() => {
  const items = player.value
    ? [
      { label: "总览", icon: "i-lucide-layout-dashboard", to: "/me", active: route.path === "/me" },
      { label: "成就", icon: "i-lucide-award", to: "/me/achievements", active: pathActive("/me/achievements") },
      { label: "提交", icon: "i-lucide-upload", to: "/me/submissions/new", active: pathActive("/me/submissions") },
      { label: "排行榜", icon: "i-lucide-trophy", to: "/leaderboard", active: pathActive("/leaderboard") },
    ]
    : introductionPages.slice(0, 4).map((page) => ({ label: page.label, icon: page.icon, to: page.to, active: pathActive(page.to) }));
  return items;
});

onMounted(() => { if (!loaded.value) void refresh(); });

/** Disclosure close. Only restore focus when the menu was closed while focus was inside the panel. */
function closeMenu(returnFocus = false) {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  if (returnFocus) nextTick(() => menuButton.value?.focus());
}

function focusFirstMenuControl() {
  const panel = menuPanel.value;
  if (!panel) return;
  menuFocusableElements(panel)[0]?.focus();
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) nextTick(focusFirstMenuControl);
}

/** Dismiss the sheet only after a leaf destination is chosen, not when expanding a group. */
function handleMobileNavClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest("a[href]")) return;
  closeMenu(false);
}

/** Keep Tab ownership inside the open mobile nav (last -> first, Shift+Tab first -> last). */
function handleMenuKeydown(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const panel = menuPanel.value;
  if (!panel) return;
  const focusables = menuFocusableElements(panel);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  const target = event.target;
  if (!(target instanceof Node) || !panel.contains(target)) return;
  if (event.shiftKey) {
    if (target === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (target === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  const wrap = menuButton.value?.closest(".app-header-wrap");
  if (target instanceof Element && target.closest(".mobile-nav-scrim")) {
    closeMenu(false);
    return;
  }
  if (wrap?.contains(target)) return;
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

watch(menuOpen, (open) => {
  if (!import.meta.client) return;
  document.body.style.overflow = open ? "hidden" : "";
});

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
  if (import.meta.client) document.body.style.overflow = "";
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
  <header class="app-header-wrap" :class="{ 'app-header-wrap--admin': isAdminPage }">
    <Transition name="mobile-nav-scrim">
      <div
        v-if="menuOpen"
        class="mobile-nav-scrim"
        aria-hidden="true"
        @pointerdown="closeMenu(false)"
      />
    </Transition>
    <div class="app-header glass">
      <NuxtLink to="/" class="brand pressable" aria-label="躲避堡垒 3 首页">
        <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 2 28 8v9c0 6.5-5 11.5-12 13C9 28.5 4 23.5 4 17V8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
          <path d="M11 11h7.5a3 3 0 0 1 0 6H11zm0 6h8.5a3 3 0 0 1 0 6H11z" fill="currentColor" opacity=".9" />
        </svg>
        <span class="brand-name">躲避堡垒<em>3</em></span>
      </NuxtLink>
      <p v-if="isAdminPage" class="sidebar-scope font-display">ADMIN</p>
      <nav class="main-nav" :aria-label="isAdminPage ? '管理导航' : '主导航'">
        <LazyUNavigationMenu v-if="isAdminPage" :items="adminNavigationItems" orientation="vertical" highlight variant="pill" />
        <LazyUNavigationMenu v-else :items="siteNavigationItems" orientation="horizontal" highlight highlight-color="primary" variant="link" content-orientation="vertical" :ui="{ viewport: 'elevation-2 w-60 mt-1 left-(--reka-navigation-menu-viewport-left) bg-elevated' }" />
      </nav>
      <div class="account-actions">
        <ThemeMenu />
        <LazyAccountMenu v-if="player" :player="player.player" @logout="signOut" />
        <NuxtLink v-else to="/login" class="login-link pressable">
          <UIcon name="i-lucide-log-in" aria-hidden="true" />
          <span>登录</span>
        </NuxtLink>
        <span v-if="player" class="account-name">{{ player.player.playerName }}</span>
      </div>
      <button
        ref="menuButton"
        class="mobile-menu-toggle pressable"
        type="button"
        :aria-label="menuOpen ? '关闭菜单' : '打开菜单'"
        :aria-expanded="menuOpen"
        :aria-controls="menuOpen ? 'mobile-nav' : undefined"
        @click="toggleMenu"
      >
        <UIcon :name="menuOpen ? 'i-lucide-x' : 'i-lucide-menu'" aria-hidden="true" />
      </button>
    </div>
    <!-- No mode="out-in": leave can be interrupted mid-flight when reopening. -->
    <Transition name="mobile-nav">
      <nav
        v-if="menuOpen"
        id="mobile-nav"
        ref="menuPanel"
        class="mobile-nav glass-heavy elevation-2"
        :aria-label="isAdminPage ? '移动端管理导航' : '移动端主导航'"
        @keydown="handleMenuKeydown"
        @click="handleMobileNavClick"
      >
        <LazyUNavigationMenu :items="isAdminPage ? adminNavigationItems : siteNavigationItems" orientation="vertical" highlight variant="pill" />
      </nav>
    </Transition>
    <nav v-if="!isAdminPage" class="tab-bar glass" aria-label="快捷导航">
      <NuxtLink v-for="item in tabItems" :key="item.to" :to="item.to" class="tab-bar__item" :class="{ 'is-active': item.active }" :aria-current="item.active ? 'page' : undefined">
        <UIcon :name="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>
  </header>
</template>

<style scoped>
/* A slim top bar at every width; phones add a bottom tab bar and tablets a slide-down menu.
   Desktop admin pages (>= 64rem) keep a fixed left sidebar for their deep section tree.
   Heights/widths are mirrored by --sidebar-width / --sticky-chrome-top in main.css. */
.app-header-wrap { container-type: inline-size; position: sticky; z-index: 20; top: 0; width: 100%; padding-top: env(safe-area-inset-top); }
.app-header { position: relative; z-index: 2; display: flex; height: 3.5rem; align-items: center; gap: var(--space-3); padding: 0 var(--space-2) 0 var(--space-4); border-bottom: 1px solid var(--line); }
.brand { display: inline-flex; min-width: 0; flex: none; align-items: center; gap: var(--space-2); color: var(--text); font-family: var(--font-display); font-size: 1rem; font-weight: 700; letter-spacing: .02em; text-decoration: none; white-space: nowrap; }
.brand-name { overflow: hidden; text-overflow: ellipsis; }
.brand-name em { margin-left: .2em; color: var(--accent); font-style: normal; }
.brand-mark { width: 1.625rem; height: 1.625rem; flex: 0 0 auto; color: var(--accent); }
.sidebar-scope { margin: 0; color: var(--signal); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .16em; }
.main-nav { display: none; }
.account-actions { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; font-size: .8125rem; font-weight: 500; }
.account-name { display: none; }
.login-link { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 2.25rem; padding: 0 var(--space-4); border-radius: var(--radius-control); color: var(--on-accent); background: var(--accent); font-weight: 700; text-decoration: none; clip-path: polygon(0 0, 100% 0, 100% calc(100% - .5rem), calc(100% - .5rem) 100%, 0 100%); }
@media (pointer: coarse) { .login-link { min-height: var(--control-lg); } }
.login-link:hover, .login-link:focus-visible { background: color-mix(in oklch, var(--accent) 86%, white); }
.mobile-nav-scrim { position: fixed; z-index: 0; inset: 0; background: color-mix(in oklch, black 48%, transparent); }
.mobile-menu-toggle { display: inline-grid; flex: 0 0 var(--control-lg); width: var(--control-lg); height: var(--control-lg); place-items: center; padding: 0; border: 0; border-radius: var(--radius-control); color: var(--text); background: transparent; }
.mobile-menu-toggle [class*="i-lucide-"] { width: 1.25rem; height: 1.25rem; }
.mobile-nav { position: absolute; z-index: 2; inset: calc(100% + var(--space-2)) var(--space-3) auto; display: grid; gap: var(--space-1); max-height: min(70dvh, calc(100dvh - var(--sticky-chrome-top) - 6rem)); padding: var(--space-2); overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--line-strong); border-radius: var(--radius-card); transform-origin: top right; }
.mobile-nav :deep(ul) { display: grid; gap: var(--space-1); }
.mobile-nav :deep([data-slot="link"]), .mobile-nav :deep([data-slot="trigger"]) { min-height: 2.75rem; border-radius: var(--radius-control); color: var(--text-on-glass-secondary); font-weight: 500; }
.mobile-nav :deep([data-slot="content"]) { padding-inline-start: var(--space-2); }
.mobile-nav :deep([data-active="true"]) { color: var(--accent); }
.tab-bar { display: none; }

@media (min-width: 64rem) {
  .mobile-menu-toggle, .mobile-nav, .mobile-nav-scrim { display: none; }
  /* Aligns with .page-shell: min(100% - 3rem, 90rem). */
  .app-header { gap: var(--space-8); padding-inline: max(1.5rem, calc((100% - 90rem) / 2)); }
  .main-nav { display: block; flex: 1; min-width: 0; align-self: stretch; }
  .main-nav :deep([data-slot="root"]), .main-nav :deep([data-slot="list"]) { height: 100%; }
  .main-nav :deep([data-slot="list"]) { gap: var(--space-1); }
  .main-nav :deep([data-slot="item"]) { height: 100%; }
  .main-nav :deep([data-slot="link"]), .main-nav :deep([data-slot="trigger"]) { height: 100%; padding-inline: var(--space-3); color: var(--text-on-glass-secondary); font-size: .875rem; font-weight: 500; }
  .main-nav :deep([data-slot="link"]:hover), .main-nav :deep([data-slot="trigger"]:hover) { color: var(--text); }
  .main-nav :deep([data-active]) { color: var(--accent); }
  .main-nav :deep([data-slot="linkLeadingIcon"]) { display: none; }

  .app-header-wrap--admin { position: fixed; inset: 0 auto 0 0; width: var(--sidebar-width); padding-top: 0; }
  .app-header-wrap--admin .app-header { height: 100%; flex-direction: column; align-items: stretch; gap: var(--space-2); padding: var(--space-5) var(--space-3) var(--space-4); border-right: 1px solid var(--line); border-bottom: 0; }
  .app-header-wrap--admin .brand { padding: 0 var(--space-2) var(--space-4); font-size: 1.0625rem; }
  .app-header-wrap--admin .brand-mark { width: 1.875rem; height: 1.875rem; }
  .app-header-wrap--admin .sidebar-scope { margin: 0 var(--space-2) var(--space-1); }
  .app-header-wrap--admin .main-nav { flex: 1; min-height: 0; margin-inline: calc(var(--space-1) * -1); padding-inline: var(--space-1); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .app-header-wrap--admin .main-nav :deep(ul) { display: grid; gap: 2px; }
  .app-header-wrap--admin .main-nav :deep([data-slot="link"]), .app-header-wrap--admin .main-nav :deep([data-slot="trigger"]) { height: auto; min-height: 2.5rem; border-radius: var(--radius-control); }
  .app-header-wrap--admin .main-nav :deep([data-slot="linkLeadingIcon"]) { display: inline-block; width: 1.125rem; height: 1.125rem; }
  .app-header-wrap--admin .main-nav :deep([data-slot="content"]) { padding-inline-start: var(--space-2); }
  .app-header-wrap--admin .account-actions { flex-wrap: wrap; margin-left: 0; padding: var(--space-3) var(--space-1) 0; border-top: 1px solid var(--line); }
  .app-header-wrap--admin .account-name { display: block; order: -1; flex: 1 1 100%; min-width: 0; overflow: hidden; padding-inline: var(--space-1); color: var(--muted); font-size: var(--type-caption-size); text-overflow: ellipsis; white-space: nowrap; }
}
@media (max-width: 47.99rem) {
  .tab-bar { position: fixed; z-index: 1; inset: auto 0 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: var(--space-1) var(--space-2) max(var(--space-1), env(safe-area-inset-bottom)); border-top: 1px solid var(--line); }
  .tab-bar__item { position: relative; display: grid; min-height: 3.25rem; place-items: center; align-content: center; gap: 2px; color: var(--quiet); font-size: .6875rem; font-weight: 500; text-decoration: none; }
  .tab-bar__item [class*="i-lucide-"] { width: 1.25rem; height: 1.25rem; }
  .tab-bar__item.is-active { color: var(--accent); }
  .tab-bar__item.is-active::before { content: ""; position: absolute; top: calc(var(--space-1) * -1); width: 1.5rem; height: 2px; background: var(--accent); }
}
/* Symmetric enter/leave; no spatial transform under reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .mobile-nav-enter-active { transition: opacity 160ms ease, transform 160ms cubic-bezier(.2, .7, .2, 1); }
  .mobile-nav-leave-active { transition: opacity 140ms ease, transform 140ms cubic-bezier(.8, 0, .8, .3); }
  .mobile-nav-enter-from, .mobile-nav-leave-to { opacity: 0; transform: translateY(-0.375rem) scale(.98); }
  .mobile-nav-enter-to, .mobile-nav-leave-from { opacity: 1; transform: translateY(0) scale(1); }
}
.mobile-nav-scrim-enter-active, .mobile-nav-scrim-leave-active { transition: opacity 160ms ease; }
.mobile-nav-scrim-enter-from, .mobile-nav-scrim-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .mobile-nav-enter-active, .mobile-nav-leave-active, .mobile-nav-scrim-enter-active, .mobile-nav-scrim-leave-active { transition: opacity 150ms ease; }
  .mobile-nav-enter-from, .mobile-nav-leave-to { opacity: 0; transform: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .mobile-nav, .tab-bar { background: var(--surface); }
}
@media (prefers-contrast: more) {
  .mobile-nav, .login-link, .tab-bar { border-color: var(--text); }
}
</style>
