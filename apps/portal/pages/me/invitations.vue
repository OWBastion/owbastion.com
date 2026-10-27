<script setup lang="ts">
import type { PlayerInvitation, PlayerInvitationRedemptionListResponse, PlayerInvitationStateResponse } from "@owbastion/contracts/player-invitation";
import { formatTime } from "~/utils/date-time";
import { portalErrorDetails } from "~/utils/portal-error";
import { playerInvitationBlockedMessage, playerInvitationErrorMessage, playerInvitationPeriodLabel, playerInvitationShareUrl, playerInvitationStatusLabel } from "~/utils/player-invitation";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "我的邀请 · 躲避堡垒 3" });

const api = usePortalApi();
const siteUrl = useRuntimeConfig().public.siteUrl;
const state = shallowRef<PlayerInvitationStateResponse | null>(null);
const redemptions = shallowRef<PlayerInvitationRedemptionListResponse | null>(null);
const invitationPage = shallowRef(1);
const redemptionPage = shallowRef(1);
const loadFailed = shallowRef(false);
const busy = shallowRef(false);
const error = shallowRef("");
const copiedId = shallowRef("");
const form = reactive({ code: "", maxUses: undefined as number | undefined, validityDays: undefined as number | undefined });

const blocked = computed(() => state.value ? playerInvitationBlockedMessage(state.value) : undefined);
const canSubmit = computed(() => !blocked.value && form.code.trim() && form.maxUses && form.validityDays);

async function load() {
  loadFailed.value = false;
  try {
    [state.value, redemptions.value] = await Promise.all([
      api<PlayerInvitationStateResponse>(`/v1/me/invitations?page=${invitationPage.value}&pageSize=20`),
      api<PlayerInvitationRedemptionListResponse>(`/v1/me/invitations/redemptions?page=${redemptionPage.value}&pageSize=20`),
    ]);
  } catch { loadFailed.value = true; }
}

async function write(path: string, body: Record<string, unknown> | undefined, fallback: string) {
  if (busy.value) return false;
  busy.value = true;
  error.value = "";
  try {
    await api(path, { method: "POST", body, headers: { "Idempotency-Key": createRequestId() } });
    await load();
    return true;
  } catch (cause) {
    const details = portalErrorDetails(cause, fallback);
    error.value = playerInvitationErrorMessage(details.code) ?? details.description;
    return false;
  } finally { busy.value = false; }
}

async function create() {
  if (!canSubmit.value) return;
  if (await write("/v1/me/invitations", { contractVersion: "1", code: form.code.trim(), maxUses: form.maxUses, validityDays: form.validityDays }, "创建失败，请稍后重试。")) {
    form.code = "";
    form.maxUses = undefined;
    form.validityDays = undefined;
  }
}

const revoke = (item: PlayerInvitation) => write(`/v1/me/invitations/${item.invitationId}/revoke`, undefined, "撤销失败，请稍后重试。");

async function copy(item: PlayerInvitation) {
  try {
    await navigator.clipboard.writeText(playerInvitationShareUrl(siteUrl, item.code));
    copiedId.value = item.invitationId;
    setTimeout(() => { copiedId.value = ""; }, 1800);
  } catch { error.value = "复制失败，请手动复制链接。"; }
}

watch([invitationPage, redemptionPage], load);
onMounted(load);
</script>

<template>
  <main class="invitations-page page-shell--narrow">
    <NuxtLink to="/me" class="back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />玩家中心</NuxtLink>
    <PageMasthead title="我的邀请" />

    <p v-if="loadFailed" class="note note--error" role="alert">无法读取邀请。<UButton label="重试" color="neutral" variant="link" size="sm" @click="load" /></p>
    <template v-else-if="state">
      <section class="card" aria-labelledby="create-title">
        <h2 id="create-title" class="section-title">创建邀请码</h2>
        <p v-if="state.policy && state.quota" class="note num">
          {{ playerInvitationPeriodLabel(state.policy.period) }}：邀请码 {{ state.quota.codesCreated }}/{{ state.quota.maxCodesCreated }} · 注册 {{ state.quota.registrations }}/{{ state.quota.maxRegistrations }}
        </p>
        <form class="form" @submit.prevent="create">
          <UInput v-model="form.code" aria-label="邀请码" placeholder="4–20 位字母、数字或连字符" maxlength="20" autocomplete="off" :disabled="busy || !!blocked" />
          <UInputNumber v-model="form.maxUses" aria-label="可用次数" placeholder="可用次数" :min="1" :max="state.policy?.maxUsesPerCode" :disabled="busy || !!blocked" />
          <UInputNumber v-model="form.validityDays" aria-label="有效天数" placeholder="有效天数" :min="1" :max="state.policy?.maxValidityDays" :disabled="busy || !!blocked" />
          <UButton type="submit" label="创建" :loading="busy" :disabled="!canSubmit" />
        </form>
        <p v-if="blocked" class="note">{{ blocked }}</p>
        <p v-if="error" class="note note--error" role="alert">{{ error }}</p>
      </section>

      <section class="card" aria-labelledby="codes-title">
        <h2 id="codes-title" class="section-title">邀请码</h2>
        <p v-if="!state.items.length" class="note">暂无邀请码。</p>
        <ul v-else class="list">
          <li v-for="item in state.items" :key="item.invitationId" class="row">
            <strong class="code">{{ item.code }}</strong>
            <span class="note num">{{ playerInvitationStatusLabel(item.status) }} · {{ item.usedCount }}/{{ item.maxUses }} · {{ formatTime(item.expiresAt) }} 到期</span>
            <span class="actions">
              <UButton :label="copiedId === item.invitationId ? '已复制' : '复制链接'" color="neutral" variant="ghost" size="sm" @click="copy(item)" />
              <UButton v-if="item.status === 'available'" label="撤销" color="error" variant="ghost" size="sm" :disabled="busy" @click="revoke(item)" />
            </span>
          </li>
        </ul>
        <UPagination v-if="state.total > state.pageSize" v-model:page="invitationPage" :total="state.total" :items-per-page="state.pageSize" />
      </section>

      <section v-if="redemptions" class="card" aria-labelledby="invitees-title">
        <h2 id="invitees-title" class="section-title">已邀请</h2>
        <p v-if="!redemptions.items.length" class="note">暂无注册。</p>
        <ul v-else class="list">
          <li v-for="(item, index) in redemptions.items" :key="index" class="row">
            <PlayerBattleTag v-if="item.playerName && item.playerId" :player-name="item.playerName" :player-id="item.playerId" mode="identity" />
            <span v-else class="note">未公开</span>
            <span class="note num">{{ item.code }} · {{ formatTime(item.completedAt) }}</span>
          </li>
        </ul>
        <UPagination v-if="redemptions.total > redemptions.pageSize" v-model:page="redemptionPage" :total="redemptions.total" :items-per-page="redemptions.pageSize" />
      </section>
    </template>
    <div v-else class="loading" role="status" aria-label="读取中…"><USkeleton /><USkeleton /></div>
  </main>
</template>

<style scoped>
.invitations-page { display: grid; gap: var(--space-6); padding-block: var(--space-8) 4.5rem; }
.invitations-page :deep(.masthead) { margin-bottom: 0; }
.back-link { display: inline-flex; align-items: center; gap: var(--space-2); justify-self: start; color: var(--muted); font-size: .9rem; text-decoration: none; }
.back-link:hover { color: var(--text); }
.card { display: grid; gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.section-title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.form { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.form > * { flex: 1 1 9rem; min-width: 0; }
.list { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); }
.code { overflow-wrap: anywhere; }
.actions { display: flex; gap: var(--space-1); margin-left: auto; }
.note { margin: 0; color: var(--quiet); font-size: .8rem; }
.note--error { color: var(--danger); }
.loading { display: grid; gap: var(--space-3); }
.loading > * { min-height: 96px; border-radius: var(--radius-card); }
@media (max-width: 47.99rem) { .invitations-page { padding-block: var(--space-5) var(--space-12); gap: var(--space-5); } }
</style>
