<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { bindingInviteCopyText, parseBattleTag } from "~/utils/binding-invite";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

type Grant = { grantId: string; label: string; category: string; mapName?: string; holderName: string; status: "unclaimed" | "active" | "revoked" };
type Holder = { holderName: string; grants: Grant[]; totalCount: number };
type Invitation = { inviteId: string; code: string; playerName: string; playerId: string; expiresAt: number; historicalMigration: { requestedCount: number } };

const emit = defineEmits<{ created: [] }>();
const api = useAdminApi();
const toast = useToast();
const battleTag = shallowRef("");
const query = shallowRef("");
const grants = shallowRef<Grant[]>([]);
const selectedHolderName = shallowRef("");
const submitting = shallowRef(false);
const loading = shallowRef(false);
const errorMessage = shallowRef("");
const invitations = ref<Invitation[]>([]);
const copiedInviteId = shallowRef<string | null>(null);

const holders = computed<Holder[]>(() => {
  const grouped = new Map<string, Grant[]>();
  for (const grant of grants.value) {
    if (grant.status !== "unclaimed") continue;
    grouped.set(grant.holderName, [...(grouped.get(grant.holderName) ?? []), grant]);
  }
  return [...grouped].map(([holderName, holderGrants]) => ({ holderName, grants: holderGrants, totalCount: holderGrants.length }));
});
const selectedHolder = computed(() => holders.value.find((holder) => holder.holderName === selectedHolderName.value) ?? null);
const selectedGrantIds = computed(() => selectedHolder.value?.grants.map((grant) => grant.grantId) ?? []);
const parsedPlayer = computed(() => parseBattleTag(battleTag.value));
const canSubmit = computed(() => Boolean(parsedPlayer.value) && !submitting.value);

async function loadCandidates() {
  loading.value = true;
  try {
    const response = await api<{ items: Grant[] }>(`/v1/title-grants?query=${encodeURIComponent(query.value.trim())}&page=1&pageSize=50`);
    grants.value = response.items;
    if (!holders.value.some((holder) => holder.holderName === selectedHolderName.value)) selectedHolderName.value = "";
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取未关联称号，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}
const debouncedLoad = useDebounceFn(() => { void loadCandidates(); }, 300);

async function createInvitation() {
  if (!canSubmit.value) return;
  submitting.value = true;
  errorMessage.value = "";
  try {
    const response = await api<Invitation>("/v1/binding-invites", {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", playerName: parsedPlayer.value!.playerName, playerId: parsedPlayer.value!.playerId, historicalTitleGrantIds: selectedGrantIds.value },
    });
    invitations.value = [response];
    toast.add({ title: response.historicalMigration.requestedCount ? `已生成邀请码并授权 ${response.historicalMigration.requestedCount} 项历史称号` : "已生成邀请码", color: "success" });
    emit("created");
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法生成邀请码，请稍后重试。").description;
  } finally {
    submitting.value = false;
  }
}

async function copyInvitation(invitation: Invitation) {
  try {
    await navigator.clipboard.writeText(bindingInviteCopyText(invitation.code, window.location.origin));
    copiedInviteId.value = invitation.inviteId;
    toast.add({ title: "已复制绑定口令", color: "success" });
  } catch {
    errorMessage.value = "无法复制口令，请检查浏览器权限。";
  }
}

onMounted(() => { void loadCandidates(); });
</script>

<template>
  <section class="invite-panel surface-card" aria-labelledby="invite-panel-title">
    <header class="invite-panel__header"><div><p class="invite-panel__eyebrow">定向邀请</p><h2 id="invite-panel-title">生成绑定邀请码</h2></div><span class="invite-panel__count glass-chip">管理员授权</span></header>
    <form class="invite-panel__form" @submit.prevent="createInvitation">
      <UInput v-model="battleTag" label="目标 BattleTag" placeholder="玩家名称#1234" aria-label="目标 BattleTag" />
      <p v-if="battleTag.trim() && !parsedPlayer" class="invite-panel__validation" role="alert">请输入完整 BattleTag，例如玩家名称#1234。</p>
      <section v-if="holders.length || loading" class="historical-section" aria-labelledby="historical-section-title">
        <div class="historical-section__heading"><div><h3 id="historical-section-title">历史称号</h3><p>可选。请明确选择正确的历史持有者；不会按 BattleTag 自动匹配。</p></div><UBadge v-if="selectedHolder" :label="`${selectedGrantIds.length} 项`" color="warning" variant="subtle" /></div>
        <UInput v-model="query" icon="i-lucide-search" placeholder="搜索历史持有者或称号" aria-label="搜索历史持有者或称号" @update:model-value="debouncedLoad" />
        <div v-if="loading" class="historical-state" role="status">读取中…</div>
        <div v-else-if="!holders.length" class="historical-state">暂无未关联称号。</div>
        <div v-else class="historical-holders" role="listbox" aria-label="选择历史持有者">
          <button v-for="holder in holders" :key="holder.holderName" type="button" class="historical-holder" :class="{ 'historical-holder--selected': selectedHolderName === holder.holderName }" role="option" :aria-selected="selectedHolderName === holder.holderName" @click="selectedHolderName = selectedHolderName === holder.holderName ? '' : holder.holderName"><strong>{{ holder.holderName }}</strong><small>{{ holder.totalCount }} 项未关联</small></button>
        </div>
        <div v-if="selectedHolder" class="historical-preview" aria-live="polite"><strong>{{ selectedHolder.holderName }}</strong><ul><li v-for="grant in selectedHolder.grants.slice(0, 6)" :key="grant.grantId"><span>{{ grant.label }}</span><small>{{ grant.mapName || grant.category }}</small></li><li v-if="selectedHolder.grants.length > 6" class="historical-preview__more">另有 {{ selectedHolder.grants.length - 6 }} 项</li></ul></div>
      </section>
      <div class="invite-panel__actions"><p class="invite-panel__hint">创建后，历史称号授权会在绑定成功后执行。</p><UButton type="submit" label="生成邀请码" :loading="submitting" :disabled="!canSubmit" /></div>
    </form>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    <div v-if="invitations.length" class="invite-results" aria-label="本次生成的邀请码"><article v-for="invitation in invitations" :key="invitation.inviteId" class="invite-result"><div class="invite-result__identity"><strong>{{ invitation.playerName }}#{{ invitation.playerId }}</strong><code>{{ invitation.code }}</code></div><UButton :label="copiedInviteId === invitation.inviteId ? '已复制' : '复制口令'" :icon="copiedInviteId === invitation.inviteId ? 'i-lucide-check' : 'i-lucide-copy'" color="neutral" variant="outline" size="sm" @click="copyInvitation(invitation)" /></article></div>
  </section>
</template>

<style scoped>
.invite-panel { display: grid; gap: 18px; padding: clamp(18px, 3vw, 28px); }.invite-panel__header, .invite-panel__actions, .invite-result { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.invite-panel__eyebrow, .invite-panel__hint, .invite-panel__count { margin: 0; color: var(--quiet); font-size: .75rem; font-weight: 650; letter-spacing: .04em; }.invite-panel__header h2 { margin: 5px 0 0; font-size: clamp(1.15rem, 2vw, 1.4rem); letter-spacing: -.035em; }.invite-panel__count { padding: 6px 9px; border: 1px solid var(--line); border-radius: 999px; }.invite-panel__form { display: grid; gap: 16px; }.invite-panel__validation { margin: -8px 0 0; color: var(--danger); font-size: .8rem; line-height: 1.5; }.historical-section { display: grid; gap: 11px; padding: 15px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in oklch, var(--surface-raised) 62%, transparent); }.historical-section__heading { display: flex; justify-content: space-between; gap: 12px; }.historical-section h3 { margin: 0; font-size: .96rem; }.historical-section p { margin: 4px 0 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }.historical-holders { display: grid; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; }.historical-holder { display: flex; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 0; color: var(--text); background: var(--surface); text-align: left; }.historical-holder + .historical-holder { border-top: 1px solid var(--line); }.historical-holder:hover, .historical-holder--selected { background: var(--accent-surface); }.historical-holder:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }.historical-holder small, .historical-preview small, .historical-preview__more, .historical-state { color: var(--quiet); font-size: .74rem; }.historical-state { padding: 14px; text-align: center; }.historical-preview { display: grid; gap: 8px; }.historical-preview ul { display: grid; gap: 1px; max-height: 190px; margin: 0; padding: 0; overflow-y: auto; list-style: none; border: 1px solid var(--line); border-radius: 10px; }.historical-preview li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; background: var(--surface); font-size: .8rem; }.historical-preview li + li { border-top: 1px solid var(--line); }.invite-results { display: grid; gap: 8px; }.invite-result { padding: 12px 13px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); }.invite-result__identity { display: grid; min-width: 0; gap: 5px; }.invite-result__identity strong { overflow-wrap: anywhere; font-size: .88rem; }.invite-result__identity code { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; font-weight: 700; letter-spacing: .08em; }
@media (max-width: 620px) { .invite-panel__header, .invite-panel__actions, .invite-result { align-items: stretch; flex-direction: column; }.invite-panel__actions :deep(button), .invite-result :deep(button) { width: 100%; justify-content: center; } }
@media (prefers-reduced-transparency: reduce) { .historical-section { background: var(--surface-raised); } }
@media (prefers-contrast: more) { .invite-panel__count, .historical-section, .historical-holders, .historical-preview ul, .invite-result { border-color: var(--line-strong); } }
</style>
