<script setup lang="ts">
const { state, code, playerName, playerId, confirmationCode, errorMessage, submit } = useBindingInvite();
useSeoMeta({ title: "QQ 绑定 · 躲避堡垒 3" });
</script>

<template>
  <main class="binding-page page-shell">
    <section class="binding-intro page-intro" aria-labelledby="binding-title"><p class="eyebrow">邀请绑定</p><h1 id="binding-title" class="page-title">绑定 QQ</h1><p class="body-copy">输入管理员提供的邀请码和战网 ID。</p></section>
    <section class="binding-card surface-card" aria-live="polite">
      <form v-if="state !== 'waiting'" class="binding-form" @submit.prevent="submit">
        <UFormField label="邀请码"><UInput v-model="code" autocomplete="off" maxlength="12" required /></UFormField>
        <UFormField label="玩家名称"><UInput v-model="playerName" autocomplete="nickname" required /></UFormField>
        <UFormField label="数字 ID"><UInput v-model="playerId" inputmode="numeric" maxlength="10" required /></UFormField>
        <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
        <UButton type="submit" label="继续" :loading="state === 'submitting'" :disabled="state === 'submitting'" />
      </form>
      <div v-else class="binding-confirmation"><p class="eyebrow">QQ 确认</p><h2 class="binding-heading">在群内确认</h2><p class="body-copy">在已开放的 QQ 群中发送：</p><p class="binding-code">/验证 {{ confirmationCode }}</p><p class="binding-note">确认后等待管理员处理。</p></div>
    </section>
  </main>
</template>

<style scoped>
.binding-page { padding-block: clamp(72px, 11vh, 130px) 56px; }.binding-intro { max-width: 680px; }.binding-card { max-width: 680px; padding: clamp(24px, 5vw, 42px); }.binding-form { display:grid; gap:18px; }.binding-heading { margin:0 0 16px; font-size:clamp(1.7rem, 5vw, 2.4rem); letter-spacing:-.035em; }.binding-code { margin:20px 0; padding:16px; border:1px solid var(--line); border-radius:12px; overflow-wrap:anywhere; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:clamp(1.1rem, 4vw, 1.5rem); font-weight:700; letter-spacing:.03em; background:var(--surface-raised); }.binding-note { margin:0; color:var(--muted); font-size:.88rem; }.binding-card { transition: transform 180ms ease, box-shadow 180ms ease; }.binding-card:focus-within { transform:translateY(-1px); box-shadow:0 12px 30px color-mix(in oklch, var(--text) 10%, transparent); } @media (prefers-reduced-motion: reduce) { .binding-card { transition:opacity 120ms ease; transform:none !important; } }
</style>
