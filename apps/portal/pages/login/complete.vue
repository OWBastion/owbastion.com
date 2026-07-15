<script setup lang="ts">
import { confirmPortalSession } from "~/utils/confirmPortalSession";

useSeoMeta({ title: "正在登录 · 躲避堡垒 3" });

const route = useRoute();
const { refresh } = useCurrentPlayer();
const state = ref<"checking" | "failed">("checking");
const returnTo = typeof route.query.returnTo === "string" && route.query.returnTo.startsWith("/") && !route.query.returnTo.startsWith("//") ? route.query.returnTo : "/me";

onMounted(async () => {
  try {
    if (!await confirmPortalSession(() => refresh({ force: true }))) throw new Error("session unavailable");
    const currentPlayer = await refresh();
    if (!currentPlayer) throw new Error("session unavailable");
    const destination = currentPlayer.player.isAdmin
      ? (returnTo === "/me" ? "/admin" : returnTo)
      : (returnTo === "/admin" ? "/me" : returnTo);
    await navigateTo(destination, { replace: true });
  } catch {
    state.value = "failed";
  }
});
</script>

<template>
  <main class="complete-page page-shell"><section class="complete-card surface-card" aria-live="polite"><p class="eyebrow">登录确认</p><h1 class="page-title">{{ state === 'checking' ? '正在连接玩家中心' : '无法完成登录' }}</h1><p class="body-copy">{{ state === 'checking' ? '正在安全确认本次浏览器会话。' : '会话没有成功建立，请返回后重新获取验证码。' }}</p><NuxtLink v-if="state === 'failed'" to="/login" class="primary-button">返回登录</NuxtLink></section></main>
</template>

<style scoped>
.complete-page { display: grid; min-height: calc(100svh - 68px); place-items: center; padding-block: 100px 56px; }.complete-card { width: min(100%, 680px); padding: clamp(28px, 6vw, 58px); }.body-copy { margin: 22px 0 30px; }
</style>
