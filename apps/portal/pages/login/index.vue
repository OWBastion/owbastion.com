<script setup lang="ts">
import { hasSafeReturnTo, safeReturnTo as normalizeReturnTo } from "~/utils/safeReturnTo";
import { qqVerificationCommand } from "~/utils/binding-invite";

useSeoMeta({ title: "登录 · 躲避堡垒 3" });
definePageMeta({ middleware: "guest" });

const route = useRoute();
const { busy, errorMessage, login } = usePasskeys();
const { state, attempt, secondsLeft, message, start, restore, cancel, copyCode, safeReturnTo } = useLoginAttempt();
const { accounts: localAccounts, selectedAccountId, loading: localLoading, errorMessage: localError, enabled: localEnabled, load: loadLocalAccounts, login: loginLocal } = useLocalDevAuth();
const returnTo = computed(() => hasSafeReturnTo(route.query.returnTo) ? normalizeReturnTo(route.query.returnTo) : "/me");
const localAccountItems = computed(() => localAccounts.value.map((account) => ({
  label: `${account.playerName}#${account.playerId}${account.isAdmin ? "（管理员）" : "（玩家）"}`,
  value: account.accountId,
})));
const preferred = shallowRef<LoginMethod>("passkey");
const copied = shallowRef(false);
const qqIdle = computed(() => ["idle", "cancelled", "expired", "failed"].includes(state.value));
const qqActive = computed(() => state.value === "waiting" && attempt.value);

onMounted(() => {
  preferred.value = preferredLoginMethod();
  restore(safeReturnTo(route.query.returnTo));
  void loadLocalAccounts();
});

async function copy() {
  await copyCode();
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1600);
}

async function handleLocalLogin() {
  const account = await loginLocal();
  if (!account) return;
  await navigateTo(hasSafeReturnTo(route.query.returnTo) ? normalizeReturnTo(route.query.returnTo) : account.isAdmin ? "/admin" : "/me", { replace: true });
}
</script>

<template>
  <main class="login-page page-shell--narrow">
    <section class="login-card surface-card" aria-labelledby="login-title">
      <h1 id="login-title" class="page-title">登录玩家帐号</h1>

      <div class="methods">
        <section class="method" aria-labelledby="passkey-method">
          <h2 id="passkey-method" class="method-title">Passkey</h2>
          <p class="method-copy">使用此设备的指纹、面容或屏幕锁验证，无需输入验证码。</p>
          <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
          <UButton
            :label="busy ? '正在验证…' : '使用 Passkey 登录'"
            icon="i-lucide-fingerprint"
            :color="preferred === 'passkey' ? 'primary' : 'neutral'"
            :variant="preferred === 'passkey' ? 'solid' : 'outline'"
            size="lg"
            block
            :loading="busy"
            :disabled="busy"
            @click="login(returnTo)"
          />
        </section>

        <section class="method" aria-labelledby="qq-method" aria-live="polite">
          <h2 id="qq-method" class="method-title">QQ 群验证</h2>
          <template v-if="qqActive && attempt">
            <div class="challenge-panel">
              <div class="challenge-heading"><p class="method-copy">在已开放的 QQ 群中发送：</p><strong>{{ secondsLeft }} 秒</strong></div>
              <p class="login-code">{{ qqVerificationCommand(attempt.code) }}</p>
              <div class="challenge-actions">
                <UButton :label="copied ? '已复制' : '复制指令'" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" color="neutral" variant="outline" @click="copy" />
                <UButton label="取消" color="neutral" variant="ghost" @click="cancel" />
              </div>
              <p class="hint">请手动输入 @，从列表选择机器人，再发送上方指令。验证码仅保存在当前标签页。</p>
            </div>
          </template>
          <template v-else>
            <p class="method-copy">适用于已绑定 QQ 的帐号，在 QQ 群内向机器人发送验证码。</p>
            <p v-if="state === 'expired'" class="notice warning">验证码已过期，请重新获取。</p>
            <p v-else-if="state === 'failed'" class="notice error">{{ message }}</p>
            <p v-else-if="state === 'cancelled'" class="notice">已取消本次验证。</p>
            <p v-else-if="state === 'creating' || state === 'session-establishing' || state === 'verified'" class="notice" role="status">{{ state === "creating" ? "生成验证码中…" : "确认登录中…" }}</p>
            <UButton
              :label="state === 'failed' || state === 'expired' ? '重新获取验证码' : '使用 QQ 验证登录'"
              icon="i-lucide-message-circle"
              :color="preferred === 'qq' ? 'primary' : 'neutral'"
              :variant="preferred === 'qq' ? 'solid' : 'outline'"
              size="lg"
              block
              :disabled="!qqIdle"
              @click="start(safeReturnTo(route.query.returnTo))"
            />
          </template>
        </section>
      </div>

      <p class="account-help">首次使用？请打开管理员发送的邀请链接。登录后可以在个人设置中添加 Passkey。</p>

      <section v-if="localEnabled" class="local-dev-panel" aria-label="本地开发登录">
        <p class="local-dev-copy">本地开发环境</p>
        <div v-if="localAccounts.length" class="local-dev-actions">
          <USelect v-model="selectedAccountId" :items="localAccountItems" aria-label="本地开发账号" class="min-w-64" />
          <UButton :label="localLoading ? '登录中…' : '使用本地账号登录'" :loading="localLoading" color="neutral" variant="outline" @click="handleLocalLogin" />
        </div>
        <p v-else-if="localError" class="notice error">{{ localError }}</p>
        <p v-else class="notice">读取本地账号中…</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; min-height: calc(100svh - 68px); place-items: center; padding-block: clamp(4.5rem, 11vh, 8.125rem) 3.5rem; }
.login-card { display: grid; width: 100%; gap: var(--space-6); padding: clamp(var(--space-6), 6vw, var(--space-16)); }
.methods { display: flex; flex-direction: column; gap: var(--space-4); }
.method { display: grid; gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.method-title { margin: 0; font-size: var(--type-headline-size, 1rem); font-weight: 600; letter-spacing: var(--type-headline-tracking); }
.method-copy { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.55; }
.notice { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
.warning { color: var(--warning); }
.error { color: var(--danger); }
.account-help { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
.challenge-panel { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid color-mix(in oklch, var(--accent) 46%, var(--line)); border-radius: var(--radius-card); background: var(--accent-surface); }
.challenge-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
.challenge-heading strong { color: var(--accent); font-size: .85rem; white-space: nowrap; }
.login-code { margin: 0; overflow-wrap: anywhere; color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.3rem, 4vw, 2rem); font-weight: 600; letter-spacing: .04em; }
.challenge-actions { display: flex; align-items: center; gap: var(--space-4); }
.hint { margin: 0; color: var(--muted); font-size: .77rem; line-height: 1.55; }
.local-dev-panel { display: grid; gap: var(--space-3); padding: var(--space-5); border: 1px dashed var(--line-strong); border-radius: var(--radius-card); background: color-mix(in oklch, var(--surface) 82%, var(--accent-surface)); }
.local-dev-copy { margin: 0; font-size: .82rem; font-weight: 600; }
.local-dev-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
@media (max-width: 47.99rem) {
  .login-page { padding-top: 3.625rem; }
  .login-card { padding: var(--space-6) var(--space-4); }
  .login-card .page-title { font-size: clamp(2.15rem, 10vw, 3rem); }
  .method { padding: var(--space-4); }
  .challenge-actions, .local-dev-actions { align-items: stretch; flex-direction: column; }
  .challenge-actions :deep(button), .local-dev-actions :deep(button), .local-dev-actions > * { width: 100%; }
}
</style>
