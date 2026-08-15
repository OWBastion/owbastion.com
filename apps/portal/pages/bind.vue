<script setup lang="ts">
import { qqVerificationCommand } from "~/utils/binding-invite";

const route = useRoute();
const { state, invite, confirmationCode, errorMessage, refreshing, refreshStatus, submit } = useBindingInvite();
const inviteCode = computed(() => typeof route.query.code === "string" ? route.query.code : "");
const copied = shallowRef(false);
useSeoMeta({ title: "QQ 绑定 · 躲避堡垒 3" });

onMounted(() => {
  if (inviteCode.value && state.value === "ready") void submit(inviteCode.value);
});

async function copyCommand() {
  if (!confirmationCode.value || !navigator.clipboard) return;
  await navigator.clipboard.writeText(qqVerificationCommand(confirmationCode.value));
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1600);
}
</script>

<template>
  <main class="binding-page page-shell--narrow">
    <section class="binding-intro page-intro" aria-labelledby="binding-title">
      <h1 id="binding-title" class="page-title">绑定 QQ</h1>
    </section>

    <UCard class="binding-card" variant="subtle" aria-live="polite">
      <section v-if="state === 'ready'" class="binding-state">
        <p class="binding-note">请使用管理员发送的绑定链接打开此页面。</p>
      </section>

      <section v-else-if="state === 'submitting'" class="binding-state"><p class="binding-note">读取绑定邀请中…</p></section>

      <section v-else class="binding-confirmation" aria-labelledby="binding-confirmation-title">
        <h2 id="binding-confirmation-title" class="binding-heading">{{ invite ? `${invite.playerName}#${invite.playerId}` : '绑定邀请' }}</h2>
        <p v-if="state === 'waiting'" class="body-copy">在已开放的 QQ 群中发送：</p>
        <p v-if="state === 'waiting'" class="binding-code">{{ qqVerificationCommand(confirmationCode) }}</p>
        <div v-if="state === 'waiting'" class="binding-actions"><UButton :label="copied ? '已复制' : '复制指令'" color="neutral" variant="outline" @click="copyCommand" /><p class="binding-note">请手动输入 @，从列表选择机器人，再发送上方指令。验证成功后自动完成首次绑定并登录。</p></div>
        <p v-else-if="state === 'review'" class="binding-note">涉及现有绑定或其他冲突，等待处理。</p>
        <p v-else-if="state === 'rejected'" class="binding-note error-note">绑定申请未通过。</p>
        <p v-else-if="state === 'expired'" class="binding-note warning-note">确认码已过期，可使用原绑定链接重新生成。</p>
        <p v-else-if="state === 'failed'" class="binding-note error-note">{{ errorMessage }}</p>
        <p v-else class="binding-note">绑定完成，正在进入玩家中心…</p>
        <UAlert v-if="errorMessage && state !== 'failed'" color="error" variant="subtle" :description="errorMessage" />
        <UButton v-if="state === 'expired' && inviteCode" class="binding-refresh w-fit" label="重新生成确认码" color="neutral" variant="outline" @click="submit(inviteCode)" />
        <UButton v-if="['waiting', 'review', 'failed'].includes(state)" class="binding-refresh w-fit" label="刷新状态" color="neutral" variant="outline" :loading="refreshing" :disabled="refreshing" @click="refreshStatus" />
      </section>
    </UCard>
  </main>
</template>

<style scoped>
.binding-page { padding-block: clamp(72px, 11vh, 130px) 56px; }
.binding-card { margin-top: 32px; }
.binding-state, .binding-confirmation { display: grid; gap: 12px; }
.binding-heading { margin: 0 0 8px; font-size: clamp(1.7rem, 5vw, 2.4rem); letter-spacing: -.035em; overflow-wrap: anywhere; }
.binding-code { margin: 8px 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.1rem, 4vw, 1.5rem); font-weight: 700; letter-spacing: .03em; background: var(--surface-raised); }
.binding-actions { display: grid; gap: 8px; }
.binding-actions :deep(button) { justify-self: start; }
.binding-note { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
.warning-note { color: var(--warning); }.error-note { color: var(--danger); }
@media (max-width: 620px) { .binding-page { padding-top: 56px; }.binding-card { margin-top: 24px; }.binding-refresh, .binding-actions :deep(button) { width: 100%; justify-content: center; } }
</style>
