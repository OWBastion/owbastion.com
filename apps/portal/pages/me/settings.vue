<script setup lang="ts">
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "个人设置 · 躲避堡垒 3" });

const { player, refresh } = useCurrentPlayer();

onMounted(() => { void refresh(); });
</script>

<template>
  <main class="settings-page page-shell--narrow">
    <NuxtLink to="/me" class="back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />玩家中心</NuxtLink>
    <h1 class="page-title">个人设置</h1>

    <template v-if="player">
      <section class="settings-section" aria-labelledby="account-title">
        <h2 id="account-title" class="section-title">帐号</h2>
        <PlayerIdentityCard :player-name="player.player.playerName" :player-id="player.player.playerId" />
      </section>

      <section class="settings-section" aria-labelledby="login-title">
        <h2 id="login-title" class="section-title">登录方式</h2>
        <PlayerPasskeyManager />
      </section>
    </template>
    <div v-else class="settings-loading" role="status" aria-label="读取中…"><USkeleton /><USkeleton /></div>
  </main>
</template>

<style scoped>
.settings-page { display: grid; gap: var(--space-8); padding-block: clamp(4rem, 9vh, 6.5rem) 4.5rem; }
.back-link { display: inline-flex; align-items: center; gap: var(--space-2); justify-self: start; color: var(--muted); font-size: .9rem; text-decoration: none; }
.back-link:hover { color: var(--text); }
.settings-section { display: grid; gap: var(--space-3); }
.section-title { margin: 0; font-size: var(--type-section-title-size); }
.settings-loading { display: grid; gap: var(--space-3); }
.settings-loading > * { min-height: 96px; border-radius: var(--radius-card); }
@media (max-width: 47.99rem) { .settings-page { padding-block: var(--space-12); gap: var(--space-6); } }
</style>
