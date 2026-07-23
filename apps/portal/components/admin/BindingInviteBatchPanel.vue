<script setup lang="ts">
import { bindingInviteCopyText } from "~/utils/binding-invite";
import { portalErrorDetails } from "~/utils/portal-error";

type Invitation = {
  inviteId: string;
  code: string;
  playerName: string;
  playerId: string;
  expiresAt: number;
};

type ParsedInvitation = Pick<Invitation, "playerName" | "playerId">;

const emit = defineEmits<{ created: [] }>();
const api = useAdminApi();
const input = ref("");
const submitting = shallowRef(false);
const errorMessage = shallowRef("");
const invitations = ref<Invitation[]>([]);
const copiedInviteId = shallowRef<string | null>(null);

const parsed = computed(() => {
  const invitations: ParsedInvitation[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  input.value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const match = line.match(/^(.+)#(\d{1,10})$/);
    const playerName = match?.[1]?.trim();
    const playerId = match?.[2];
    if (!playerName || !playerId || playerName.length > 64) {
      errors.push(`第 ${index + 1} 行格式无效`);
      return;
    }

    const key = `${playerName.toLocaleLowerCase()}#${playerId}`;
    if (seen.has(key)) {
      errors.push(`第 ${index + 1} 行重复`);
      return;
    }

    seen.add(key);
    invitations.push({ playerName, playerId });
  });

  if (invitations.length > 100) errors.push("一次最多生成 100 个邀请码");
  return { invitations, errors };
});

const toast = useToast();
const canSubmit = computed(() => parsed.value.invitations.length > 0 && !parsed.value.errors.length && !submitting.value);
const countLabel = computed(() => parsed.value.invitations.length ? `${parsed.value.invitations.length} 位玩家` : "每行一位玩家");

async function createInvitations() {
  if (!canSubmit.value) return;

  submitting.value = true;
  errorMessage.value = "";
  copiedInviteId.value = null;

  try {
    const response = await api<{ items: Invitation[] }>("/v1/binding-invites/batch", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", invitations: parsed.value.invitations },
    });
    invitations.value = response.items;
    input.value = "";
    toast.add({ title: `已生成 ${response.items.length} 个邀请码`, color: "success" });
    emit("created");
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法生成邀请码，请稍后重试。").description;
  } finally {
    submitting.value = false;
  }
}

function copyText(invitation: Invitation) {
  return bindingInviteCopyText(invitation.code, window.location.origin);
}

async function copyInvitation(invitation: Invitation) {
  try {
    await navigator.clipboard.writeText(copyText(invitation));
    copiedInviteId.value = invitation.inviteId;
    toast.add({ title: "已复制绑定口令", color: "success" });
    window.setTimeout(() => {
      if (copiedInviteId.value === invitation.inviteId) copiedInviteId.value = null;
    }, 1_800);
  } catch {
    errorMessage.value = "无法复制口令，请检查浏览器权限。";
  }
}
</script>

<template>
  <section class="batch-invites surface-card" aria-labelledby="batch-invites-title">
    <header class="batch-invites__header">
      <div><p class="batch-invites__eyebrow">定向邀请</p><h2 id="batch-invites-title">批量生成邀请码</h2></div>
      <span class="batch-invites__count">{{ countLabel }}</span>
    </header>
    <form class="batch-invites__form" @submit.prevent="createInvitations">
      <UTextarea v-model="input" :rows="7" aria-label="BattleTag 列表" placeholder="玩家名称#1234&#10;另一位玩家#5678" />
      <div class="batch-invites__actions"><p class="batch-invites__hint">每行一个 BattleTag</p><UButton type="submit" label="生成邀请码" :loading="submitting" :disabled="!canSubmit" /></div>
    </form>
    <p v-if="parsed.errors.length" class="batch-invites__validation" role="alert">{{ parsed.errors.join("；") }}</p>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    <TransitionGroup v-if="invitations.length" name="invite-list" tag="div" class="invite-results" aria-label="本次生成的邀请码">
      <article v-for="invitation in invitations" :key="invitation.inviteId" class="invite-result">
        <div class="invite-result__identity"><strong>{{ invitation.playerName }}#{{ invitation.playerId }}</strong><code>{{ invitation.code }}</code></div>
        <UButton :label="copiedInviteId === invitation.inviteId ? '已复制' : '复制口令'" :icon="copiedInviteId === invitation.inviteId ? 'i-lucide-check' : 'i-lucide-copy'" color="neutral" variant="outline" size="sm" :aria-label="`复制 ${invitation.playerName} 的绑定口令`" @click="copyInvitation(invitation)" />
      </article>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.batch-invites { display: grid; gap: 18px; padding: clamp(18px, 3vw, 28px); }.batch-invites__header, .batch-invites__actions, .invite-result { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.batch-invites__eyebrow, .batch-invites__hint, .batch-invites__count { margin: 0; color: var(--quiet); font-size: .75rem; font-weight: 650; letter-spacing: .04em; }
.batch-invites__header h2 { margin: 5px 0 0; font-size: clamp(1.15rem, 2vw, 1.4rem); letter-spacing: -.035em; }
.batch-invites__count { padding: 6px 9px; border: 1px solid var(--line); border-radius: 999px; background: color-mix(in oklch, var(--surface-raised) 76%, transparent); backdrop-filter: blur(12px); }
.batch-invites__form { display: grid; gap: 10px; }.batch-invites__actions { min-height: 34px; }.batch-invites__validation { margin: 0; color: var(--danger); font-size: .82rem; line-height: 1.5; }.invite-results { display: grid; gap: 8px; }.invite-result { padding: 12px 13px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in oklch, var(--surface-raised) 86%, transparent); }.invite-result__identity { display: grid; min-width: 0; gap: 5px; }.invite-result__identity strong { overflow-wrap: anywhere; font-size: .88rem; letter-spacing: -.015em; }.invite-result__identity code { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; font-weight: 700; letter-spacing: .08em; }.invite-list-enter-active, .invite-list-leave-active { transition: opacity 180ms ease, transform 180ms cubic-bezier(.2, .7, .2, 1); }.invite-list-enter-from, .invite-list-leave-to { opacity: 0; transform: translateY(5px); }
.batch-invites :deep(button) { transition: transform 100ms ease-out; }.batch-invites :deep(button:active) { transform: scale(.98); }
@media (max-width: 620px) { .batch-invites__header, .batch-invites__actions, .invite-result { align-items: stretch; flex-direction: column; }.batch-invites__count { align-self: flex-start; }.batch-invites__actions :deep(button), .invite-result :deep(button) { width: 100%; justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .batch-invites :deep(button) { transition: none; }.invite-list-enter-active, .invite-list-leave-active { transition: opacity 120ms ease; }.invite-list-enter-from, .invite-list-leave-to { transform: none; } }
@media (prefers-reduced-transparency: reduce) { .batch-invites__count, .invite-result { background: var(--surface-raised); backdrop-filter: none; } }
@media (prefers-contrast: more) { .batch-invites__count, .invite-result { border-color: var(--line-strong); } }
</style>
