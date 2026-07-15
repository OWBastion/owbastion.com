<script setup lang="ts">
import { confirmPortalSession } from "~/utils/confirmPortalSession";

useSeoMeta({ title: "登录确认 · 躲避堡垒 3" });

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
  <main class="complete-page page-shell"><section class="complete-card surface-card" aria-live="polite"><p class="eyebrow">登录确认</p><h1 class="page-title">{{ state === 'checking' ? '登录中…' : '登录失败' }}</h1><p v-if="state === 'failed'" class="body-copy">无法建立会话，请重新登录。</p><NuxtLink v-if="state === 'failed'" to="/login" class="primary-button">返回登录</NuxtLink></section></main>
</template>

<style scoped>
.complete-page { display: grid; min-height: calc(100svh - 68px); place-items: center; padding-block: 100px 56px; }.complete-card { width: min(100%, 680px); padding: clamp(28px, 6vw, 58px); }.body-copy { margin: 22px 0 30px; }
</style>
