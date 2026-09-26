<script setup lang="ts">
import { hasSafeReturnTo, safeReturnTo as normalizeReturnTo } from "~/utils/safeReturnTo";

useSeoMeta({ title: "Passkey 登录 · 躲避堡垒 3" });
definePageMeta({ middleware: "guest" });

const route = useRoute();
const { busy, errorMessage, login } = usePasskeys();
const { accounts: localAccounts, selectedAccountId, loading: localLoading, errorMessage: localError, enabled: localEnabled, load: loadLocalAccounts, login: loginLocal } = useLocalDevAuth();
const returnTo = computed(() => hasSafeReturnTo(route.query.returnTo) ? normalizeReturnTo(route.query.returnTo) : "/me");
const localAccountItems = computed(() => localAccounts.value.map((account) => ({
  label: `${account.playerName}#${account.playerId}${account.isAdmin ? "（管理员）" : "（玩家）"}`,
  value: account.accountId,
})));

onMounted(() => { void loadLocalAccounts(); });

async function handleLocalLogin() {
  const account = await loginLocal();
  if (!account) return;
  await navigateTo(hasSafeReturnTo(route.query.returnTo) ? normalizeReturnTo(route.query.returnTo) : account.isAdmin ? "/admin" : "/me", { replace: true });
}
</script>

<template>
  <main class="login-page page-shell--narrow">
    <section class="login-card surface-card" aria-live="polite">
      <h1 class="page-title">使用 Passkey<br>登录玩家帐号</h1>
      <p class="body-copy intro">使用已注册的设备凭据验证身份。QQ 绑定仅用于 QQBot 功能。</p>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
      <UButton :label="busy ? '正在验证…' : '使用 Passkey 登录'" color="primary" size="lg" :loading="busy" :disabled="busy" @click="login(returnTo)" />
      <p class="account-help">首次使用？请打开管理员发送的邀请链接，先注册 Passkey。</p>

      <section v-if="localEnabled" class="local-dev-panel" aria-label="本地开发登录">
        <p class="local-dev-copy">本地开发环境</p>
        <div v-if="localAccounts.length" class="local-dev-actions">
          <USelect v-model="selectedAccountId" :items="localAccountItems" aria-label="本地开发账号" class="min-w-64" />
          <UButton :label="localLoading ? '登录中…' : '使用本地账号登录'" :loading="localLoading" color="neutral" variant="outline" @click="handleLocalLogin" />
        </div>
        <p v-else-if="localError" class="notice">{{ localError }}</p>
        <p v-else class="notice">读取本地账号中…</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; min-height: calc(100svh - 68px); place-items: center; padding-block: clamp(4.5rem, 11vh, 8.125rem) 3.5rem; }
.login-card { display: grid; width: 100%; gap: var(--space-5); padding: clamp(var(--space-6), 6vw, var(--space-16)); }
.intro { max-width: 43ch; margin: 0; }
.account-help, .notice { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
.local-dev-panel { display: grid; gap: var(--space-3); margin-top: var(--space-3); padding: var(--space-5); border: 1px dashed var(--line-strong); border-radius: var(--radius-card); background: color-mix(in oklch, var(--surface) 82%, var(--accent-surface)); }
.local-dev-copy { margin: 0; font-size: .82rem; font-weight: 600; }
.local-dev-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
@media (max-width: 47.99rem) {
  .login-page { padding-top: 3.625rem; }
  .login-card { padding: var(--space-6) var(--space-4); }
  .login-card .page-title { font-size: clamp(2.15rem, 10vw, 3rem); }
  .local-dev-actions { align-items: stretch; flex-direction: column; }
  .local-dev-actions :deep(button), .local-dev-actions > * { width: 100%; }
}
</style>
