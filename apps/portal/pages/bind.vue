<script setup lang="ts">
import { parseBattleTag, qqVerificationCommand } from "~/utils/binding-invite";

const { state, invite, confirmationCode, errorMessage, rejectionMessage, refreshing, refreshStatus, submit } = useBindingInvite();
const turnstile = useTurnstile();
const route = useRoute();
const playerCode = typeof route.query["player-code"] === "string" ? route.query["player-code"] : "";
const inviteCode = shallowRef(playerCode);
const battleTag = shallowRef("");
const player = computed(() => parseBattleTag(battleTag.value));
const showForm = computed(() => state.value === "ready" || (state.value === "failed" && !invite.value) || (state.value === "expired" && !inviteCode.value.trim()));
const needsTurnstile = computed(() => showForm.value || (state.value === "expired" && Boolean(inviteCode.value.trim())));
const copied = shallowRef(false);
// 1: enter the invite, 2: confirm in a QQ group (or wait for review), 3: bound.
const step = computed(() => showForm.value || state.value === "submitting" ? 1 : state.value === "waiting" || state.value === "expired" || state.value === "review" || state.value === "failed" || state.value === "rejected" ? 2 : 3);
const steps = ["输入邀请码", "在 QQ 群确认", "完成绑定"];
useSeoMeta({ title: "QQ 绑定 · 躲避堡垒 3" });

async function redeem() {
  if (playerCode && player.value) await submit(inviteCode.value, turnstile.token.value, player.value);
  else await submit(inviteCode.value, turnstile.token.value);
  turnstile.reset();
}

async function copyCommand() {
  if (!confirmationCode.value || !navigator.clipboard) return;
  await navigator.clipboard.writeText(qqVerificationCommand(confirmationCode.value));
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1600);
}
</script>

<template>
  <main class="binding-page auth-layout page-shell">
    <AuthBrandPanel eyebrow="First binding" :points="[{ icon: 'i-lucide-ticket', text: '使用管理员发送的邀请码' }, { icon: 'i-lucide-message-circle', text: '在已开放的 QQ 群里向机器人发送确认码' }, { icon: 'i-lucide-log-in', text: '确认后自动完成首次绑定并登录' }]" />
    <section class="binding-card" aria-labelledby="binding-title" aria-live="polite">
      <h1 id="binding-title" class="binding-title">绑定 QQ</h1>
      <ol class="binding-steps" aria-label="绑定进度">
        <li v-for="(label, index) in steps" :key="label" :class="{ 'is-done': index + 1 < step, 'is-current': index + 1 === step }" :aria-current="index + 1 === step ? 'step' : undefined">
          <span class="binding-steps__dot num">{{ index + 1 }}</span>{{ label }}
        </li>
      </ol>
      <form v-if="showForm" class="binding-state" @submit.prevent="redeem">
        <UInput v-model="inviteCode" label="邀请码" placeholder="请输入邀请码" aria-label="邀请码" autocomplete="off" />
        <UInput v-if="playerCode" v-model="battleTag" label="BattleTag" placeholder="玩家名#1234" aria-label="BattleTag" autocomplete="off" />
        <p v-if="state === 'failed'" class="binding-note error-note" role="alert">{{ errorMessage }}</p>
        <p v-else-if="state === 'expired'" class="binding-note warning-note">确认码已过期，请重新输入邀请码。</p>
        <div class="action-row"><UButton type="submit" label="下一步" :disabled="!inviteCode.trim() || (playerCode && !player) || !turnstile.token.value" /></div>
      </form>

      <section v-else-if="state === 'submitting'" class="binding-state"><p class="binding-note">读取绑定邀请中…</p></section>

      <section v-else class="binding-confirmation" aria-labelledby="binding-confirmation-title">
        <h2 id="binding-confirmation-title" class="binding-heading">{{ invite ? `${invite.playerName}#${invite.playerId}` : '绑定邀请' }}</h2>
        <p v-if="state === 'waiting'" class="body-copy">在已开放的 QQ 群中发送：</p>
        <p v-if="state === 'waiting'" class="binding-code">{{ qqVerificationCommand(confirmationCode) }}</p>
        <p v-if="state === 'waiting'" class="binding-note">请手动输入 @，从列表选择机器人，再发送上方指令。验证成功后自动完成首次绑定并登录。</p>
        <p v-else-if="state === 'review'" class="binding-note">涉及现有绑定或其他冲突，待处理。</p>
        <p v-else-if="state === 'rejected'" class="binding-note error-note">{{ rejectionMessage ?? "绑定申请未通过。" }}</p>
        <p v-else-if="state === 'expired'" class="binding-note warning-note">确认码已过期，可使用原邀请码重新生成。</p>
        <p v-else-if="state === 'failed'" class="binding-note error-note">{{ errorMessage }}</p>
        <p v-else class="binding-note">绑定完成，进入玩家中心…</p>
        <UAlert v-if="errorMessage && state !== 'failed'" color="error" variant="subtle" :description="errorMessage" />
        <div v-if="['waiting', 'expired', 'review', 'failed'].includes(state)" class="action-row">
          <UButton v-if="state === 'waiting'" :label="copied ? '已复制' : '复制指令'" @click="copyCommand" />
          <UButton v-if="state === 'expired' && inviteCode" label="重新生成确认码" :disabled="!turnstile.token.value" @click="redeem" />
          <UButton v-if="['waiting', 'review', 'failed'].includes(state)" label="刷新状态" color="neutral" variant="outline" :loading="refreshing" :disabled="refreshing" @click="refreshStatus" />
        </div>
      </section>

      <div v-show="needsTurnstile" class="turnstile-slot">
        <div :ref="turnstile.element" class="turnstile-widget"></div>
        <p v-if="turnstile.failed.value" class="binding-note error-note">人机验证加载失败，请刷新页面重试。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.binding-card { display: grid; gap: var(--space-6); }
.binding-title { margin: 0; font-family: var(--font-display); font-size: var(--type-headline-size); font-weight: 700; }
.binding-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin: 0; padding: 0; color: var(--quiet); font-size: var(--type-caption-size); list-style: none; }
.binding-steps li { display: grid; gap: var(--space-2); padding-top: var(--space-3); border-top: 2px solid var(--line); }
.binding-steps li.is-done { border-top-color: color-mix(in oklch, var(--accent) 50%, var(--line)); color: var(--muted); }
.binding-steps li.is-current { border-top-color: var(--accent); color: var(--text); font-weight: 600; }
.binding-steps__dot { color: var(--accent); font-size: .875rem; font-weight: 700; }
.binding-state, .binding-confirmation { display: grid; gap: var(--space-3); }
.binding-heading { margin: 0 0 var(--space-2); font-family: var(--font-display); font-size: clamp(1.5rem, 4vw, 2rem); overflow-wrap: anywhere; }
.binding-code { margin: var(--space-2) 0; padding: var(--space-4); border: 1px solid var(--line-strong); border-radius: var(--radius-control); overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(1.1rem, 4vw, 1.5rem); font-weight: 700; letter-spacing: .03em; background: var(--accent-surface); }
.binding-note { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
.turnstile-slot { display: grid; gap: var(--space-3); justify-items: center; margin-top: var(--space-3); min-height: 65px; }
.turnstile-widget { min-height: 65px; }
.warning-note { color: var(--warning); }
.error-note { color: var(--danger); }
.action-row { display: flex; flex-wrap: wrap; gap: var(--space-3); }
</style>
