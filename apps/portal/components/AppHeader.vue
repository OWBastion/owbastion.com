<script setup lang="ts">
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
const adminPathActive = (to: string, exact = false) => exact ? route.path === to : route.path === to || route.path.startsWith(`${to}/`);
const adminNavigationItems = computed(() => {
  const achievementPageActive = adminPathActive("/admin/achievements");
  const section = Array.isArray(route.query.section) ? route.query.section[0] : route.query.section;
  const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  const invitationTabActive = ["invitations", "create", "batch"].includes(tab ?? "");
  const playerBindingActive = adminPathActive("/admin/bindings") && !invitationTabActive;
  const playerActive = adminPathActive("/admin/players") || playerBindingActive;
  const invitationActive = adminPathActive("/admin/bindings") && invitationTabActive;
  const ocrActive = ["/admin/annotations", "/admin/datasets"].some((to) => adminPathActive(to));
  const toolsActive = ["/admin/grants", "/admin/mastery-runs", "/admin/titles"].some((to) => adminPathActive(to));
  return [
    { label: "称号", icon: "i-lucide-award", to: "/admin/achievements?section=catalog", active: achievementPageActive && section === "catalog" },
    { label: "挑战", icon: "i-lucide-list-checks", to: "/admin/achievements?section=generic", active: achievementPageActive && section !== "catalog" },
    { label: "地图", icon: "i-lucide-map", to: "/admin/maps", active: adminPathActive("/admin/maps") },
    { label: "随机事件", icon: "i-lucide-zap", to: "/admin/events", active: adminPathActive("/admin/events") },
    {
      label: "玩家",
      icon: "i-lucide-users",
      active: playerActive,
      defaultOpen: playerActive,
      children: [
        { label: "玩家列表", description: "身份、称号与进度", icon: "i-lucide-user-round", to: "/admin/players", active: adminPathActive("/admin/players") },
        { label: "绑定例外", description: "冲突与换绑", icon: "i-lucide-link", to: "/admin/bindings", active: playerBindingActive },
      ],
    },
    {
      label: "邀请",
      icon: "i-lucide-mail-plus",
      active: invitationActive || adminPathActive("/admin/channels"),
      defaultOpen: invitationActive || adminPathActive("/admin/channels"),
      children: [
        { label: "邀请管理", description: "首次注册与绑定", icon: "i-lucide-ticket", to: "/admin/bindings?tab=invitations", active: invitationActive },
        { label: "QQ 群组策略", description: "绑定渠道接入", icon: "i-lucide-radio", to: "/admin/channels", active: adminPathActive("/admin/channels") },
      ],
    },
    { label: "截图审核", icon: "i-lucide-scan-eye", to: "/admin/reviews", active: adminPathActive("/admin/reviews") },
    {
      label: "OCR",
      icon: "i-lucide-scan-text",
      active: ocrActive,
      defaultOpen: ocrActive,
      children: [
        { label: "标注与反馈", description: "OCR 质量核对", icon: "i-lucide-scan-text", to: "/admin/annotations", active: adminPathActive("/admin/annotations") },
        { label: "数据集快照", description: "样本查询与定稿", icon: "i-lucide-database", to: "/admin/datasets", active: adminPathActive("/admin/datasets") },
      ],
    },
    {
      label: "评价与审核",
      icon: "i-lucide-message-square-quote",
      to: "/admin/player-reviews",
      active: adminPathActive("/admin/player-reviews"),
    },
    {
      label: "更多",
      icon: "i-lucide-wrench",
      active: toolsActive,
      defaultOpen: toolsActive,
      children: [
        { label: "通关记录", description: "Verified Run 查询与冲突处理", icon: "i-lucide-trophy", to: "/admin/mastery-runs", active: adminPathActive("/admin/mastery-runs") },
        { label: "称号授予", description: "历史授权维护", icon: "i-lucide-send", to: "/admin/grants", active: adminPathActive("/admin/grants") },
        { label: "称号迁移", description: "历史数据关联与修复", icon: "i-lucide-history", to: "/admin/titles", active: adminPathActive("/admin/titles") },
      ],
    },
  ];
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
  <header class="app-header-wrap scroll-edge">
    <Transition name="mobile-nav-scrim">
      <div
        v-if="menuOpen"
        class="mobile-nav-scrim"
        aria-hidden="true"
        @pointerdown="closeMenu(false)"
      />
    </Transition>
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
          <NuxtLink to="/events" class="pressable">随机事件</NuxtLink>
          <NuxtLink to="/maps" class="pressable">地图</NuxtLink>
          <NuxtLink to="/achievements" class="pressable">成就</NuxtLink>
          <NuxtLink to="/changelog" class="pressable">版本更新</NuxtLink>
          <NuxtLink to="/blog" class="pressable">开发日志</NuxtLink>
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
        <template v-if="isAdminPage">
          <LazyUNavigationMenu :items="adminNavigationItems" orientation="vertical" highlight variant="pill" />
        </template>
        <template v-else>
          <NuxtLink to="/events" class="pressable">随机事件</NuxtLink>
          <NuxtLink to="/maps" class="pressable">地图</NuxtLink>
          <NuxtLink to="/achievements" class="pressable">成就</NuxtLink>
          <NuxtLink to="/changelog" class="pressable">版本更新</NuxtLink>
          <NuxtLink to="/blog" class="pressable">开发日志</NuxtLink>
        </template>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
.app-header-wrap { container-type: inline-size; position: sticky; z-index: 10; top: 0.875rem; width: min(100% - var(--space-12), 90rem); margin: 0 auto; }
.app-header { position: relative; z-index: 2; display: flex; align-items: center; gap: var(--space-6); min-height: 3.375rem; padding: 0 var(--space-4) 0 var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); }
.brand { display: inline-flex; min-width: 0; align-items: center; gap: var(--space-2); color: var(--text); font-size: .9rem; font-weight: 600; letter-spacing: -.025em; text-decoration: none; white-space: nowrap; }
.brand > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.brand-mark { display: grid; width: 1.75rem; height: 1.75rem; place-items: center; border-radius: 50%; color: var(--on-accent); background: var(--accent); font-size: .92rem; font-weight: 700; }
.main-nav { display: flex; flex: 1; min-width: 0; align-items: center; justify-content: flex-start; gap: var(--space-1); color: var(--text-on-glass-secondary); font-size: .78rem; font-weight: 500; }
.main-nav :deep([data-slot="root"]) { width: max-content; max-width: 100%; }
.main-nav :deep([data-slot="root"] > div:first-child) { flex: 1 1 auto; min-width: 0; max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
.main-nav :deep([data-slot="root"] > div:first-child)::-webkit-scrollbar { display: none; }
.main-nav :deep(ul) { flex-wrap: nowrap; gap: var(--space-1); }
.main-nav :deep([data-slot="list"]) { width: max-content; min-width: 100%; }
.main-nav :deep([data-slot="link"]), .main-nav :deep([data-slot="trigger"]) { min-height: 2.75rem; border-radius: var(--radius-control); font-size: .78rem; font-weight: 500; color: var(--text-on-glass-secondary); }
.main-nav a {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  padding: 0 var(--space-3);
  border-radius: var(--radius-control);
  color: var(--text-on-glass-secondary);
  text-decoration: none;
  white-space: nowrap;
  transition: color 160ms ease, background 160ms ease;
}
.main-nav a:hover, .main-nav a:focus-visible, .main-nav a.router-link-exact-active,
.main-nav :deep([data-slot="link"]:hover), .main-nav :deep([data-slot="link"]:focus-visible),
.main-nav :deep([data-slot="trigger"]:hover), .main-nav :deep([data-slot="trigger"]:focus-visible),
.main-nav :deep([data-active="true"]) {
  color: var(--text-on-glass);
  background: color-mix(in oklch, var(--surface-raised) 72%, transparent);
}
.account-actions { display: flex; flex: 0 0 auto; align-items: center; gap: var(--space-3); font-size: .78rem; font-weight: 500; }
.login-link { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0 var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); color: var(--text); background: var(--surface-raised); text-decoration: none; }
.mobile-menu-toggle, .mobile-nav, .mobile-nav-scrim { display: none; }
@media (max-width: 47.99rem) {
  .app-header-wrap { top: max(0.5rem, env(safe-area-inset-top)); width: min(100% - var(--space-6), 90rem); }
  .app-header { gap: var(--space-3); min-height: 3.25rem; padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3); }
  .main-nav { display: none; }
  .account-actions { margin-left: auto; }
  .mobile-nav-scrim {
    display: block;
    position: fixed;
    z-index: 0;
    inset: 0;
    background: color-mix(in oklch, black 36%, transparent);
  }
  .mobile-menu-toggle {
    display: inline-grid;
    flex: 0 0 var(--control-lg);
    width: var(--control-lg);
    height: var(--control-lg);
    place-items: center;
    padding: 0;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-control);
    color: var(--text);
    background: var(--surface-raised);
  }
  .mobile-menu-toggle svg,
  .mobile-menu-toggle [class*="i-lucide-"] {
    width: 1.1875rem;
    height: 1.1875rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
  .mobile-nav {
    position: absolute;
    z-index: 2;
    inset: calc(100% + var(--space-2)) 0 auto;
    display: grid;
    gap: var(--space-1);
    max-height: min(70dvh, calc(100dvh - var(--sticky-chrome-top) - 1rem));
    padding: var(--space-2);
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    transform-origin: top right;
  }
  .mobile-nav a {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    color: var(--text-on-glass-secondary);
    font-weight: 500;
    text-decoration: none;
    transition: color 160ms ease, background 160ms ease;
  }
  .mobile-nav a:hover,
  .mobile-nav a:focus-visible,
  .mobile-nav a.router-link-exact-active {
    color: var(--text-on-glass);
    background: var(--surface);
  }
  .mobile-nav :deep(ul) { display: grid; gap: var(--space-1); }
  .mobile-nav :deep([data-slot="link"]),
  .mobile-nav :deep([data-slot="trigger"]) {
    min-height: 2.75rem;
    border-radius: var(--radius-control);
    color: var(--text-on-glass-secondary);
    font-weight: 500;
  }
  .mobile-nav :deep([data-slot="content"]) {
    padding-inline-start: var(--space-2);
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
    transform: translateY(-0.375rem) scale(.98);
  }
  .mobile-nav-enter-to,
  .mobile-nav-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.mobile-nav-scrim-enter-active,
.mobile-nav-scrim-leave-active {
  transition: opacity 160ms ease;
}
.mobile-nav-scrim-enter-from,
.mobile-nav-scrim-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .mobile-nav-enter-active,
  .mobile-nav-leave-active,
  .mobile-nav-scrim-enter-active,
  .mobile-nav-scrim-leave-active {
    transition: opacity 150ms ease;
  }
  .mobile-nav-enter-from,
  .mobile-nav-leave-to {
    opacity: 0;
    transform: none;
  }
}
@container (max-width: 23.99rem) {
  .app-header { gap: var(--space-2); }
  .account-actions { gap: var(--space-2); }
  .brand { gap: var(--space-2); font-size: .82rem; }
  .brand-mark { width: 1.625rem; height: 1.625rem; }
}
@media (prefers-reduced-transparency: reduce) {
  .mobile-nav { background: var(--surface); }
  .mobile-nav-scrim { background: color-mix(in oklch, black 48%, transparent); }
}
@media (prefers-contrast: more) {
  .mobile-menu-toggle,
  .mobile-nav,
  .login-link { border-color: var(--text); }
}
</style>
