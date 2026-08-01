<script setup lang="ts">
const route = useRoute();
const { state, invite, confirmationCode, errorMessage, refreshing, refreshStatus, submit } = useBindingInvite();
useSeoMeta({ title: "QQ 绑定 · 躲避堡垒 3" });

onMounted(() => {
  const code = typeof route.query.code === "string" ? route.query.code : "";
  if (code && state.value === "ready") void submit(code);
});
</script>

<template>
  <main class="binding-page page-shell">
    <section class="binding-intro page-intro" aria-labelledby="binding-title">
      <p class="eyebrow">邀请绑定</p>
      <h1 id="binding-title" class="page-title">绑定 QQ</h1>
      <p class="body-copy">管理员已为指定 BattleTag 创建邀请。按页面提示完成一次 QQ 验证即可进入玩家中心。</p>
    </section>

    <UCard class="binding-card" variant="subtle" aria-live="polite">
      <section v-if="state === 'ready'" class="binding-state">
        <p class="binding-note">请使用管理员发送的绑定链接打开此页面。</p>
      </section>

      <section v-else-if="state === 'submitting'" class="binding-state"><p class="binding-note">读取绑定邀请中…</p></section>

      <section v-else class="binding-confirmation" aria-labelledby="binding-confirmation-title">
        <p class="eyebrow">目标账号</p>
        <h2 id="binding-confirmation-title" class="binding-heading">{{ invite ? `${invite.playerName}#${invite.playerId}` : '绑定邀请' }}</h2>
        <p v-if="state === 'waiting'" class="body-copy">在已开放的 QQ 群中发送：</p>
        <p v-if="state === 'waiting'" class="binding-code">@E54机器人 /验证 {{ confirmationCode }}</p>
        <p v-if="state === 'waiting'" class="binding-note">验证成功后将自动完成首次绑定并登录。</p>
        <p v-else-if="state === 'review'" class="binding-note">此操作涉及现有绑定或其他冲突，等待管理员处理。处理完成后本页面会继续登录。</p>
        <p v-else-if="state === 'rejected'" class="binding-note error-note">绑定申请未通过。</p>
        <p v-else-if="state === 'expired'" class="binding-note warning-note">绑定邀请或确认码已过期，请联系管理员重新生成链接。</p>
        <p v-else-if="state === 'failed'" class="binding-note error-note">{{ errorMessage }}</p>
        <p v-else class="binding-note">绑定完成，正在进入玩家中心…</p>
        <UAlert v-if="errorMessage && state !== 'failed'" color="error" variant="subtle" :description="errorMessage" />
        <UButton v-if="['waiting', 'review', 'failed'].includes(state)" class="binding-refresh w-fit" label="刷新状态" color="neutral" variant="outline" :loading="refreshing" :disabled="refreshing" @click="refreshStatus" />
      </section>
    </UCard>
  </main>
</template>

<style scoped>
.binding-page { padding-block: clamp(72px, 11vh, 130px) 56px; }
.binding-intro, .binding-card { max-width: 680px; }
.binding-card { margin-top: 32px; }
.binding-state, .binding-confirmation { display: grid; gap: 12px; }
.binding-heading { margin: 0 0 8px; font-size: clamp(1.7rem, 5vw, 2.4rem); letter-spacing: -.035em; overflow-wrap: anywhere; }
.binding-code { margin: 8px 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.1rem, 4vw, 1.5rem); font-weight: 700; letter-spacing: .03em; background: var(--surface-raised); }
.binding-note { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
.warning-note { color: var(--warning); }.error-note { color: var(--danger); }
@media (max-width: 620px) { .binding-page { padding-top: 56px; }.binding-card { margin-top: 24px; }.binding-refresh { width: 100%; justify-content: center; } }
</style>
