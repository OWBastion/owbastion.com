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
  <main class="complete-page page-shell--narrow"><section class="complete-card surface-card" aria-live="polite"><h1 class="page-title">{{ state === 'checking' ? '登录中…' : '登录失败' }}</h1><p v-if="state === 'failed'" class="body-copy">登录未完成，请重新登录。</p><div v-if="state === 'failed'" class="action-row"><UButton to="/login" label="返回登录" /></div></section></main>
</template>

<style scoped>
.complete-page { display: grid; min-height: calc(100svh - 68px); place-items: center; padding-block: 6.25rem 3.5rem; }
.complete-card { width: 100%; padding: clamp(1.75rem, 6vw, 3.625rem); }
.body-copy { margin: var(--space-5) 0 var(--space-8); }
</style>
