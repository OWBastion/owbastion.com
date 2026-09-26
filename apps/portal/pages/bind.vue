<script setup lang="ts">
import { qqVerificationCommand } from "~/utils/binding-invite";

const route = useRoute();
const { busy: passkeyBusy, errorMessage: passkeyError, errorCode: passkeyErrorCode, registerInvitation } = usePasskeys();
const { state: bindingState, invite, confirmationCode, errorMessage: bindingError, refreshing, refreshStatus, submit } = useBindingInvite();
const inviteCode = computed(() => typeof route.query.code === "string" ? route.query.code : "");
const typedInviteCode = shallowRef("");
const passkeyName = shallowRef("");
const qqMode = shallowRef(false);
const copied = shallowRef(false);
const code = computed(() => (inviteCode.value || typedInviteCode.value).trim().toUpperCase());
const existingPlayer = computed(() => passkeyErrorCode.value === "PLAYER_ACCOUNT_EXISTS");

useSeoMeta({ title: "玩家邀请 · 躲避堡垒 3" });

async function registerPasskey() {
  if (!code.value) return;
  await registerInvitation(code.value, passkeyName.value.trim() || "我的 Passkey");
}

async function useQqBinding() {
  if (!code.value) return;
  qqMode.value = true;
  await submit(code.value);
}

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
      <h1 id="binding-title" class="page-title">{{ qqMode ? '绑定 QQ 渠道' : '注册玩家帐号' }}</h1>
    </section>

    <UCard v-if="!qqMode" class="binding-card" variant="subtle" aria-live="polite">
      <div class="binding-state">
        <p class="binding-note">使用管理员邀请建立 Player Account，然后为这个帐号注册 Passkey。BattleTag 用于游戏身份，QQ 为可选的 QQBot 渠道。</p>
        <UFormField v-if="!inviteCode" label="邀请代码">
          <UInput v-model="typedInviteCode" autocomplete="one-time-code" maxlength="12" class="w-full" />
        </UFormField>
        <UFormField label="Passkey 名称" hint="例如：手机、笔记本">
          <UInput v-model="passkeyName" maxlength="64" class="w-full" />
        </UFormField>
        <UAlert v-if="passkeyError" color="error" variant="subtle" :description="passkeyError" />
        <UButton :label="passkeyBusy ? '正在注册…' : '注册 Passkey'" color="primary" size="lg" :loading="passkeyBusy" :disabled="passkeyBusy || !code" @click="registerPasskey" />
        <p v-if="existingPlayer" class="binding-note">这个 BattleTag 已有帐号。若帐号还没有 Passkey，请联系管理员进行身份核验和恢复。</p>
        <UButton v-if="existingPlayer" label="为现有帐号绑定 QQ 渠道" color="neutral" variant="outline" @click="useQqBinding" />
      </div>
    </UCard>

    <UCard v-else class="binding-card" variant="subtle" aria-live="polite">
      <section class="binding-state">
        <p class="binding-heading">{{ invite ? `${invite.playerName}#${invite.playerId}` : 'QQ 渠道邀请' }}</p>
        <p v-if="bindingState === 'ready'" class="binding-note">请使用管理员发送的邀请链接打开此页面。</p>
        <template v-else-if="bindingState === 'submitting'"><p class="binding-note">读取 QQ 渠道邀请中…</p></template>
        <template v-else>
          <p v-if="bindingState === 'waiting'" class="binding-note">在已开放的 QQ 群中发送：</p>
          <p v-if="bindingState === 'waiting'" class="binding-code">{{ qqVerificationCommand(confirmationCode) }}</p>
          <p v-if="bindingState === 'waiting'" class="binding-note">请手动输入 @，从列表选择机器人，再发送上方指令。此步骤只绑定 QQ 渠道，不会登录 Portal。</p>
          <p v-else-if="bindingState === 'review'" class="binding-note">绑定申请待管理员处理。</p>
          <p v-else-if="bindingState === 'rejected'" class="binding-note error-note">绑定申请未通过。</p>
          <p v-else-if="bindingState === 'expired'" class="binding-note warning-note">确认码已过期，可重新生成。</p>
          <p v-else-if="bindingState === 'failed'" class="binding-note error-note">{{ bindingError }}</p>
          <p v-else class="binding-note">QQ 渠道绑定完成。Portal 登录仍使用 Passkey。</p>
          <UAlert v-if="bindingError && bindingState !== 'failed'" color="error" variant="subtle" :description="bindingError" />
          <div v-if="['waiting', 'expired', 'review', 'failed'].includes(bindingState)" class="action-row">
            <UButton v-if="bindingState === 'waiting'" :label="copied ? '已复制' : '复制指令'" @click="copyCommand" />
            <UButton v-if="bindingState === 'expired' && code" label="重新生成确认码" @click="submit(code)" />
            <UButton v-if="['waiting', 'review', 'failed'].includes(bindingState)" label="刷新状态" color="neutral" variant="outline" :loading="refreshing" :disabled="refreshing" @click="refreshStatus" />
          </div>
        </template>
      </section>
    </UCard>
  </main>
</template>

<style scoped>
.binding-page { padding-block: clamp(4.5rem, 11vh, 8.125rem) 3.5rem; }
.binding-card { margin-top: var(--space-8); }
.binding-state { display: grid; gap: var(--space-4); }
.binding-heading { margin: 0 0 var(--space-2); font-size: clamp(1.7rem, 5vw, 2.4rem); letter-spacing: -.035em; overflow-wrap: anywhere; }
.binding-code { margin: var(--space-1) 0; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.1rem, 4vw, 1.5rem); font-weight: 700; letter-spacing: .03em; background: var(--surface-raised); }
.binding-note { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
.warning-note { color: var(--warning); }
.error-note { color: var(--danger); }
.action-row { display: flex; flex-wrap: wrap; gap: var(--space-3); }
@media (max-width: 47.99rem) { .binding-page { padding-top: 3.5rem; } .binding-card { margin-top: var(--space-6); } .action-row { align-items: stretch; flex-direction: column; } }
</style>
