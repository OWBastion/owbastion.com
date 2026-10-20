<script setup lang="ts">
import { introductionPages } from "~/utils/introduction-pages";
import { adminPathActive, adminSectionGroups } from "~/utils/admin-sections";

const { player, loaded, refresh, logout } = useCurrentPlayer();
const loggingOut = ref(false);
const menuOpen = ref(false);
const route = useRoute();
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
// Flat list at every width: signed-in players get their own pages first, then the public introduction pages.
const siteNavigationItems = computed(() => {
  const introduction = introductionPages.map((page) => ({ ...page, active: pathActive(page.to) }));
  if (!player.value) return introduction;
  return [
    { label: "总览", icon: "i-lucide-layout-dashboard", to: "/me", active: route.path === "/me" },
    { label: "我的成就", icon: "i-lucide-award", to: "/me/achievements", active: pathActive("/me/achievements") },
    { label: "提交截图", icon: "i-lucide-upload", to: "/me/submissions/new", active: pathActive("/me/submissions") },
    ...introduction,
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

/** Dismiss the sheet only after a leaf destination is chosen, not when expanding a group. */
function handleMobileNavClick(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest("a[href]")) menuOpen.value = false;
}

watch(() => route.fullPath, () => { menuOpen.value = false; });

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
    <div class="app-header glass">
      <NuxtLink to="/" class="brand pressable" aria-label="躲避堡垒 3 首页">
        <img class="brand-mark" src="/logo.png" alt="" width="26" height="26" />
        <span class="brand-name">躲避堡垒<em>3</em></span>
      </NuxtLink>
      <p v-if="isAdminPage" class="sidebar-scope font-display">ADMIN</p>
      <nav class="main-nav" :aria-label="isAdminPage ? '管理导航' : '主导航'">
        <LazyUNavigationMenu v-if="isAdminPage" :items="adminNavigationItems" orientation="vertical" highlight variant="pill" />
        <LazyUNavigationMenu v-else :items="siteNavigationItems" orientation="horizontal" highlight highlight-color="primary" variant="link" />
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
      <USlideover v-model:open="menuOpen" side="right" title="导航菜单" description="站点导航" :ui="{ header: 'sr-only', content: 'max-w-sm' }">
        <UButton class="mobile-menu-toggle" icon="i-lucide-menu" color="neutral" variant="ghost" aria-label="打开菜单" />
        <template #body>
          <nav id="mobile-nav" :aria-label="isAdminPage ? '移动端管理导航' : '移动端主导航'" @click="handleMobileNavClick">
            <LazyUNavigationMenu :items="isAdminPage ? adminNavigationItems : siteNavigationItems" orientation="vertical" highlight variant="pill" />
          </nav>
        </template>
      </USlideover>
    </div>
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
.brand-name em { margin-left: .2em; color: var(--muted); font-style: normal; }
.brand-mark { width: 1.625rem; height: 1.625rem; flex: 0 0 auto; object-fit: contain; }
.sidebar-scope { margin: 0; color: var(--muted); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .16em; }
.main-nav { display: none; }
.account-actions { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; font-size: .8125rem; font-weight: 500; }
.account-name { display: none; }
.login-link { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 2.25rem; padding: 0 var(--space-4); border-radius: var(--radius-control); color: var(--on-accent); background: var(--accent); font-weight: 700; text-decoration: none; clip-path: polygon(0 0, 100% 0, 100% calc(100% - .5rem), calc(100% - .5rem) 100%, 0 100%); }
@media (pointer: coarse) { .login-link { min-height: var(--control-lg); } }
.login-link:hover, .login-link:focus-visible { background: color-mix(in oklch, var(--accent) 86%, white); }
.tab-bar { display: none; }

@media (min-width: 64rem) {
  .mobile-menu-toggle { display: none; }
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
  .app-header-wrap--admin .main-nav :deep(ul) { display: grid; align-content: start; gap: 2px; }
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
@media (prefers-reduced-transparency: reduce) {
  .tab-bar { background: var(--surface); }
}
@media (prefers-contrast: more) {
  .login-link, .tab-bar { border-color: var(--text); }
}
</style>
