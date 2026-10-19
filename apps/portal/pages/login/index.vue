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
  <main class="login-page page-shell">
    <aside class="login-brand" aria-hidden="true">
      <svg class="login-brand__mark" viewBox="0 0 32 32">
        <path d="M16 2 28 8v9c0 6.5-5 11.5-12 13C9 28.5 4 23.5 4 17V8z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M11 11h7.5a3 3 0 0 1 0 6H11zm0 6h8.5a3 3 0 0 1 0 6H11z" fill="currentColor" opacity=".9" />
      </svg>
      <p class="eyebrow">Player account</p>
      <p class="login-brand__title">躲避堡垒<em>3</em></p>
      <ul class="login-brand__list">
        <li><UIcon name="i-lucide-upload" />提交通关截图，审核后获得精通 XP</li>
        <li><UIcon name="i-lucide-award" />查看已获得的成就与称号</li>
        <li><UIcon name="i-lucide-trophy" />在排行榜上找到自己的名次</li>
      </ul>
    </aside>
    <section class="login-card" aria-labelledby="login-title">
      <h1 id="login-title" class="login-title">登录玩家帐号</h1>

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

        <p class="methods-divider" aria-hidden="true">或</p>
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
.login-page { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 28rem); align-items: center; gap: clamp(2rem, 6vw, 6rem); min-height: calc(100svh - 10rem); padding-block: clamp(3rem, 9vh, 6rem); }
.login-brand { position: relative; display: grid; align-content: center; gap: var(--space-4); min-height: 26rem; padding: clamp(var(--space-6), 4vw, var(--space-12)); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: radial-gradient(70% 80% at 0% 100%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 70%), var(--surface); }
.login-brand__mark { position: absolute; right: -3rem; bottom: -3rem; width: 22rem; height: 22rem; color: color-mix(in oklch, var(--accent) 22%, transparent); }
.login-brand__title { margin: 0; font-family: var(--font-display); font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.login-brand__title em { margin-left: .15em; color: var(--accent); font-style: normal; }
.login-brand__list { position: relative; display: grid; gap: var(--space-3); margin: var(--space-4) 0 0; padding: 0; color: var(--muted); list-style: none; }
.login-brand__list li { display: flex; align-items: center; gap: var(--space-3); }
.login-brand__list [class*="i-lucide-"] { flex: none; width: 1.125rem; height: 1.125rem; color: var(--accent); }
.login-card { display: grid; width: 100%; gap: var(--space-6); }
.login-title { margin: 0; font-family: var(--font-display); font-size: var(--type-headline-size); font-weight: 700; }
.methods { display: flex; flex-direction: column; gap: var(--space-5); }
.methods-divider { display: flex; align-items: center; gap: var(--space-3); margin: 0; color: var(--quiet); font-size: var(--type-caption-size); }
.methods-divider::before, .methods-divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.method { display: grid; gap: var(--space-3); }
.method-title { margin: 0; font-size: 1.0625rem; font-weight: 600; }
.method-copy { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.55; }
.notice { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
.warning { color: var(--warning); }
.error { color: var(--danger); }
.account-help { margin: 0; padding-top: var(--space-4); border-top: 1px solid var(--line); color: var(--muted); font-size: .86rem; line-height: 1.55; }
.challenge-panel { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid color-mix(in oklch, var(--accent) 46%, var(--line)); border-radius: var(--radius-card); background: var(--accent-surface); }
.challenge-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
.challenge-heading strong { color: var(--accent); font-size: .85rem; white-space: nowrap; }
.login-code { margin: 0; overflow-wrap: anywhere; color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.3rem, 4vw, 2rem); font-weight: 600; letter-spacing: .04em; }
.challenge-actions { display: flex; align-items: center; gap: var(--space-4); }
.hint { margin: 0; color: var(--muted); font-size: .77rem; line-height: 1.55; }
.local-dev-panel { display: grid; gap: var(--space-3); padding: var(--space-5); border: 1px dashed var(--line-strong); border-radius: var(--radius-card); background: color-mix(in oklch, var(--surface) 82%, var(--accent-surface)); }
.local-dev-copy { margin: 0; font-size: .82rem; font-weight: 600; }
.local-dev-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
@media (max-width: 63.99rem) {
  .login-page { grid-template-columns: minmax(0, 1fr); max-width: 32rem; min-height: 0; }
  .login-brand { min-height: 0; padding: var(--space-6); }
  .login-brand__list { display: none; }
  .login-brand__mark { width: 12rem; height: 12rem; right: -2rem; bottom: -2.5rem; }
}
@media (max-width: 47.99rem) {
  .login-page { padding-block: var(--space-6) var(--space-12); }
  .challenge-actions, .local-dev-actions { align-items: stretch; flex-direction: column; }
  .challenge-actions :deep(button), .local-dev-actions :deep(button), .local-dev-actions > * { width: 100%; }
}
</style>
