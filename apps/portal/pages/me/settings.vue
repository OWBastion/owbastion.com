<script setup lang="ts">
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "个人设置 · 躲避堡垒 3" });

const { player, refresh } = useCurrentPlayer();

onMounted(() => { void refresh(); });
</script>

<template>
  <main class="settings-page page-shell--narrow">
    <NuxtLink to="/me" class="back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />玩家中心</NuxtLink>
    <PageMasthead title="设置" />

    <template v-if="player">
      <section class="settings-section" aria-labelledby="account-title">
        <h2 id="account-title" class="section-title"><UIcon name="i-lucide-user-round" aria-hidden="true" />帐号</h2>
        <div class="settings-card"><PlayerBattleTag :player-name="player.player.playerName" :player-id="player.player.playerId" mode="identity" /></div>
      </section>

      <section class="settings-section" aria-labelledby="login-title">
        <h2 id="login-title" class="section-title"><UIcon name="i-lucide-key-round" aria-hidden="true" />登录方式</h2>
        <PlayerPasskeyManager />
      </section>
    </template>
    <div v-else class="settings-loading" role="status" aria-label="读取中…"><USkeleton /><USkeleton /></div>
  </main>
</template>

<style scoped>
.settings-page { display: grid; gap: var(--space-6); padding-block: var(--space-8) 4.5rem; }
.settings-page :deep(.masthead) { margin-bottom: 0; }
.settings-card { padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.back-link { display: inline-flex; align-items: center; gap: var(--space-2); justify-self: start; color: var(--muted); font-size: .9rem; text-decoration: none; }
.back-link:hover { color: var(--text); }
.settings-section { display: grid; gap: var(--space-3); }
.section-title { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.section-title svg { color: var(--muted); }
.settings-loading { display: grid; gap: var(--space-3); }
.settings-loading > * { min-height: 96px; border-radius: var(--radius-card); }
@media (max-width: 47.99rem) { .settings-page { padding-block: var(--space-5) var(--space-12); gap: var(--space-5); } }
</style>
