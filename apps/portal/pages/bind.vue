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
        <p v-if="state === 'waiting'" class="binding-note">请手动输入 @，从列表选择机器人，再发送上方指令。验证成功后自动完成首次绑定并登录。</p>
        <p v-else-if="state === 'review'" class="binding-note">涉及现有绑定或其他冲突，待处理。</p>
        <p v-else-if="state === 'rejected'" class="binding-note error-note">绑定申请未通过。</p>
        <p v-else-if="state === 'expired'" class="binding-note warning-note">确认码已过期，可使用原绑定链接重新生成。</p>
        <p v-else-if="state === 'failed'" class="binding-note error-note">{{ errorMessage }}</p>
        <p v-else class="binding-note">绑定完成，进入玩家中心…</p>
        <UAlert v-if="errorMessage && state !== 'failed'" color="error" variant="subtle" :description="errorMessage" />
        <div v-if="['waiting', 'expired', 'review', 'failed'].includes(state)" class="action-row">
          <UButton v-if="state === 'waiting'" :label="copied ? '已复制' : '复制指令'" @click="copyCommand" />
          <UButton v-if="state === 'expired' && inviteCode" label="重新生成确认码" @click="submit(inviteCode)" />
          <UButton v-if="['waiting', 'review', 'failed'].includes(state)" label="刷新状态" color="neutral" variant="outline" :loading="refreshing" :disabled="refreshing" @click="refreshStatus" />
        </div>
      </section>
    </UCard>
  </main>
</template>

<style scoped>
.binding-page { padding-block: clamp(4.5rem, 11vh, 8.125rem) 3.5rem; }
.binding-card { margin-top: var(--space-8); }
.binding-state, .binding-confirmation { display: grid; gap: var(--space-3); }
.binding-heading { margin: 0 0 var(--space-2); font-size: clamp(1.7rem, 5vw, 2.4rem); letter-spacing: -.035em; overflow-wrap: anywhere; }
.binding-code { margin: var(--space-2) 0; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.1rem, 4vw, 1.5rem); font-weight: 700; letter-spacing: .03em; background: var(--surface-raised); }
.binding-note { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
.warning-note { color: var(--warning); }
.error-note { color: var(--danger); }
@media (max-width: 47.99rem) {
  .binding-page { padding-top: 3.5rem; }
  .binding-card { margin-top: var(--space-6); }
}
</style>
