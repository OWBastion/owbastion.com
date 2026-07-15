<script setup lang="ts">
const { player, loaded, refresh, logout } = useCurrentPlayer();
const loggingOut = ref(false);

onMounted(() => { if (!loaded.value) void refresh(); });

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
      <nav class="main-nav" aria-label="主导航"><NuxtLink to="/#events">事件</NuxtLink><NuxtLink to="/#achievements">成就</NuxtLink><NuxtLink to="/#rankings">天梯排名</NuxtLink><NuxtLink to="/#rotation">轮换挑战</NuxtLink></nav>
      <div class="account-actions">
        <template v-if="player"><NuxtLink to="/me" class="account-link">我的</NuxtLink><button class="text-button" type="button" :disabled="loggingOut" @click="signOut">退出</button></template>
        <NuxtLink v-else to="/login" class="login-link">登录 <span aria-hidden="true">↗</span></NuxtLink>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header-wrap { position: sticky; z-index: 10; top: 14px; width: min(100% - 28px, 1280px); margin: 0 auto; }
.app-header { display: flex; align-items: center; gap: 28px; min-height: 54px; padding: 0 16px 0 12px; border: 1px solid var(--line); border-radius: 14px; background: oklch(18% 0.013 48 / 82%); box-shadow: 0 8px 22px -18px oklch(0% 0 0 / 80%); backdrop-filter: blur(20px) saturate(145%); }
.brand { display: inline-flex; align-items: center; gap: 9px; color: var(--text); font-size: .9rem; font-weight: 650; letter-spacing: -.025em; text-decoration: none; white-space: nowrap; }
.brand-mark { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; color: oklch(22% 0.025 50); background: var(--accent); font-size: .92rem; font-weight: 760; }
.main-nav { display: flex; flex: 1; justify-content: center; gap: clamp(16px, 2.6vw, 34px); color: var(--muted); font-size: .78rem; }
.main-nav a, .account-link { text-decoration: none; transition: color 160ms ease; }
.main-nav a:hover, .account-link:hover { color: var(--text); }
.account-actions { display: flex; align-items: center; gap: 14px; font-size: .78rem; font-weight: 650; }
.account-link, .text-button { color: var(--muted); }
.text-button { padding: 0; border: 0; background: transparent; }
.login-link { min-height: 34px; padding: 8px 11px; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: var(--surface-raised); text-decoration: none; transition: transform 100ms ease-out, background 160ms ease; }
.login-link:active { transform: scale(.97); }
@media (max-width: 620px) { .app-header-wrap { top: 8px; } .app-header { flex-wrap: wrap; gap: 12px; padding: 10px 12px; } .main-nav { order: 3; width: 100%; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line); font-size: .72rem; } }
</style>
