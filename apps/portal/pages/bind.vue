<script setup lang="ts">
const { state, code, playerName, playerId, confirmationCode, errorMessage, submit } = useBindingInvite();
useSeoMeta({ title: "QQ 绑定 · 躲避堡垒 3" });
</script>

<template>
  <main class="binding-page page-shell">
    <section class="binding-intro page-intro" aria-labelledby="binding-title">
      <p class="eyebrow">邀请绑定</p>
      <h1 id="binding-title" class="page-title">绑定 QQ</h1>
      <p class="body-copy">输入管理员提供的邀请码和战网 ID。</p>
    </section>

    <UCard class="binding-card" variant="subtle" aria-live="polite">
      <form v-if="state !== 'waiting'" class="binding-form" @submit.prevent="submit">
        <UFormField class="w-full" label="邀请码">
          <UInput v-model="code" class="w-full" icon="i-lucide-ticket" autocomplete="off" maxlength="12" placeholder="输入邀请码" :disabled="state === 'submitting'" required />
        </UFormField>
        <UFormField class="w-full" label="玩家名称">
          <UInput v-model="playerName" class="w-full" icon="i-lucide-user" autocomplete="nickname" placeholder="输入玩家名称" :disabled="state === 'submitting'" required />
        </UFormField>
        <UFormField class="w-full" label="数字 ID">
          <UInput v-model="playerId" class="w-full" icon="i-lucide-hash" inputmode="numeric" maxlength="10" placeholder="输入数字 ID" :disabled="state === 'submitting'" required />
        </UFormField>
        <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
        <UButton class="binding-submit w-fit justify-self-start" type="submit" label="继续" :loading="state === 'submitting'" :disabled="state === 'submitting'" />
      </form>

      <section v-else class="binding-confirmation" aria-labelledby="binding-confirmation-title">
        <p class="eyebrow">QQ 确认</p>
        <h2 id="binding-confirmation-title" class="binding-heading">在群内确认</h2>
        <p class="body-copy">在已开放的 QQ 群中发送：</p>
        <p class="binding-code">/验证 {{ confirmationCode }}</p>
        <p class="binding-note">确认后等待管理员处理。</p>
      </section>
    </UCard>
  </main>
</template>

<style scoped>
.binding-page { padding-block: clamp(72px, 11vh, 130px) 56px; }
.binding-intro, .binding-card { max-width: 680px; }
.binding-card { margin-top: 32px; }
.binding-form { display: grid; gap: 18px; }
.binding-heading { margin: 0 0 16px; font-size: clamp(1.7rem, 5vw, 2.4rem); letter-spacing: -.035em; }
.binding-code { margin: 20px 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.1rem, 4vw, 1.5rem); font-weight: 700; letter-spacing: .03em; background: var(--surface-raised); }
.binding-note { margin: 0; color: var(--muted); font-size: .88rem; }

@media (max-width: 620px) {
  .binding-page { padding-top: 56px; }
  .binding-card { margin-top: 24px; }
  .binding-submit { width: 100%; justify-self: stretch; }
}
</style>
