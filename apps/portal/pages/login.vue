<script setup lang="ts">
useSeoMeta({ title: "登录 · 躲避堡垒 3" });

const route = useRoute();
const { state, attempt, secondsLeft, message, start, restore, cancel, copyCode, safeReturnTo } = useLoginAttempt();
const returnTo = computed(() => safeReturnTo(route.query.returnTo));
const copied = ref(false);
const { accounts: localAccounts, selectedAccountId, loading: localLoading, errorMessage: localError, enabled: localEnabled, load: loadLocalAccounts, login: loginLocal } = useLocalDevAuth();

onMounted(() => {
  restore(returnTo.value);
  void loadLocalAccounts();
});

async function copy() {
  await copyCode();
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1600);
}
</script>

<template>
  <main class="login-page page-shell">
    <section class="login-card surface-card" aria-live="polite">
      <p class="eyebrow">玩家登录</p>
      <h1 class="page-title">用 QQ 机器人<br>完成登录验证</h1>
      <p class="body-copy intro">请在已绑定且已开放的 QQ 群中完成验证。</p>

      <div v-if="state === 'idle' || state === 'cancelled' || state === 'expired' || state === 'failed'" class="action-panel">
        <p v-if="state === 'expired'" class="notice warning">验证码已过期，请重新获取。</p>
        <p v-else-if="state === 'failed'" class="notice error">{{ message }}</p>
        <p v-else-if="state === 'cancelled'" class="notice">已取消本次验证。</p>
        <button class="primary-button" type="button" @click="start(returnTo)">{{ state === 'failed' || state === 'expired' ? '重新获取验证码' : '生成登录验证码' }}</button>
      </div>

      <div v-else-if="state === 'creating'" class="action-panel"><p class="notice">正在生成一次性验证码……</p></div>

      <div v-else-if="state === 'waiting' && attempt" class="challenge-panel">
        <div class="challenge-heading"><div><p class="challenge-label">群内验证</p><p class="challenge-copy">在已开放的 QQ 群中 @机器人发送：</p></div><strong>{{ secondsLeft }} 秒</strong></div>
        <p class="login-code">/验证 {{ attempt.code }}</p>
        <div class="challenge-actions"><button class="secondary-button" type="button" @click="copy">{{ copied ? '已复制' : '复制指令' }}</button><button class="text-button" type="button" @click="cancel">取消</button></div>
        <p class="hint">验证成功后会自动进入玩家中心。验证码仅在本浏览器标签页临时保存。</p>
      </div>

      <div v-else class="action-panel"><p class="notice">正在确认登录状态……</p></div>

      <section v-if="localEnabled" class="local-dev-panel" aria-labelledby="local-dev-title">
        <p class="challenge-label" id="local-dev-title">本地开发</p>
        <p class="local-dev-copy">不连接 QQ，直接使用本地 D1 中的开发账号验证 Portal 页面。</p>
        <p v-if="localError" class="notice error">{{ localError }}</p>
        <div v-else-if="localAccounts.length" class="local-dev-actions">
          <select v-model="selectedAccountId" aria-label="本地开发账号">
            <option v-for="account in localAccounts" :key="account.accountId" :value="account.accountId">{{ account.playerName }}#{{ account.playerId }}{{ account.isAdmin ? '（管理员）' : '（玩家）' }}</option>
          </select>
          <button class="secondary-button" type="button" :disabled="localLoading" @click="loginLocal">{{ localLoading ? '登录中……' : '使用本地账号登录' }}</button>
        </div>
        <p v-else class="notice">正在读取本地开发账号……</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; min-height: calc(100svh - 68px); place-items: center; padding-block: clamp(72px, 11vh, 130px) 56px; }.login-card { width: min(100%, 680px); padding: clamp(26px, 6vw, 58px); }.intro { max-width: 43ch; margin: 22px 0 38px; }.action-panel { min-height: 118px; }.notice { margin: 0 0 18px; color: var(--muted); line-height: 1.55; }.warning { color: var(--warning); }.error { color: var(--danger); }.challenge-panel { padding: 22px; border: 1px solid color-mix(in oklch, var(--accent) 46%, var(--line)); border-radius: 15px; background: var(--accent-surface); }.challenge-heading { display: flex; justify-content: space-between; gap: 18px; color: var(--text); }.challenge-heading strong { color: var(--accent); font-size: .85rem; white-space: nowrap; }.challenge-label { margin: 0 0 6px; color: var(--accent); font-size: .72rem; font-weight: 720; letter-spacing: .06em; }.challenge-copy { margin: 0; font-size: .88rem; }.login-code { margin: 20px 0; overflow-wrap: anywhere; color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.3rem, 4vw, 2rem); font-weight: 720; letter-spacing: .04em; }.challenge-actions { display: flex; align-items: center; gap: 16px; }.text-button { min-height: 40px; padding: 0; border: 0; color: var(--muted); background: transparent; font-size: .85rem; }.hint { margin: 20px 0 0; color: var(--muted); font-size: .77rem; line-height: 1.55; }.local-dev-panel { margin-top: 34px; padding: 22px; border: 1px dashed var(--line-strong); border-radius: 15px; background: color-mix(in oklch, var(--surface) 82%, var(--accent-surface)); }.local-dev-copy { margin: 0 0 16px; color: var(--muted); font-size: .86rem; line-height: 1.55; }.local-dev-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }.local-dev-actions select { min-height: 44px; min-width: 0; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 10px; color: var(--text); background: var(--surface-raised); }
@media (max-width: 430px) { .login-page { padding-top: 58px; }.login-card { padding: 24px 18px; }.login-card .page-title { font-size: clamp(2.15rem, 10vw, 3rem); }.challenge-panel, .local-dev-panel { padding: 18px; }.challenge-heading { align-items: flex-start; flex-direction: column; gap: 8px; }.challenge-actions, .local-dev-actions { align-items: stretch; flex-direction: column; }.challenge-actions .secondary-button, .local-dev-actions select, .local-dev-actions .secondary-button { width: 100%; } }
</style>
