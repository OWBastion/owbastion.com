<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "玩家详情 · 躲避堡垒 3" });

const route = useRoute();
const api = useAdminApi();
const toast = useToast();
const player = shallowRef<AdminPlayerDetail | null>(null);
const loading = shallowRef(true);
const actionLoading = shallowRef(false);
const identityEditorOpen = shallowRef(false);
const identityLoading = shallowRef(false);
const recoveryOpen = shallowRef(false);
const recoveryLoading = shallowRef(false);
const recoveryIdentityVerified = shallowRef(false);
const recoveryRequestId = shallowRef("");
const recoveryError = shallowRef("");
const recoveryLink = shallowRef("");
const recoveryExpiresAt = shallowRef<number | null>(null);
const recoveryCopied = shallowRef(false);
const errorMessage = shallowRef("");
const pendingAction = shallowRef<{ type: "set-status"; status: "active" | "banned" } | { type: "unbind"; bindingId: string } | null>(null);
const banReason = shallowRef("");
const playerAccountId = computed(() => String(route.params.playerAccountId));
const actionTitle = computed(() => pendingAction.value?.type === "unbind" ? "解除 QQ 绑定" : pendingAction.value?.status === "banned" ? "封禁玩家" : "解除封禁");
const actionDescription = computed(() => player.value ? `${player.value.playerName}#${player.value.playerId}` : undefined);

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    player.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${encodeURIComponent(playerAccountId.value)}`);
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取玩家详情，请稍后重试。").description;
  } finally { loading.value = false; }
}
function requestStatus(status: "active" | "banned") { banReason.value = ""; pendingAction.value = { type: "set-status", status }; }
function requestUnbind(bindingId: string) { pendingAction.value = { type: "unbind", bindingId }; }
function closeAction(force = false) { if (actionLoading.value && !force) return; pendingAction.value = null; banReason.value = ""; }
async function setStatus(next: "active" | "banned") {
  if (!player.value) return;
  actionLoading.value = true;
  try {
    const reason = banReason.value.trim();
    await api(`/v1/player-accounts/${player.value.playerAccountId}/status`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", status: next, ...(reason ? { reason } : {}) } });
    toast.add({ title: next === "banned" ? "玩家已封禁" : "玩家已解封", color: "success" });
    closeAction(true);
    await load();
  } catch (error) { toast.add({ title: "无法更新玩家状态", description: portalErrorDetails(error).description, color: "error" }); }
  finally { actionLoading.value = false; }
}
async function unbind(bindingId: string) {
  if (!player.value) return;
  actionLoading.value = true;
  try {
    await api(`/v1/bindings/${bindingId}`, { method: "DELETE", headers: { "Idempotency-Key": createRequestId() } });
    toast.add({ title: "QQ 绑定已解除", color: "success" });
    closeAction(true);
    await load();
  } catch (error) { toast.add({ title: "无法解除 QQ 绑定", description: portalErrorDetails(error).description, color: "error" }); }
  finally { actionLoading.value = false; }
}
function confirmAction() {
  if (!pendingAction.value) return;
  if (pendingAction.value.type === "unbind") void unbind(pendingAction.value.bindingId);
  else void setStatus(pendingAction.value.status);
}
async function updateIdentity(playerName: string) {
  if (!player.value) return;
  identityLoading.value = true;
  try {
    await api(`/v1/player-accounts/${player.value.playerAccountId}/identity`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", playerName } });
    toast.add({ title: "战网 ID 已更新", color: "success" });
    identityEditorOpen.value = false;
    await load();
  } catch (error) {
    toast.add({ title: "无法更新战网 ID", description: portalErrorDetails(error).description, color: "error" });
  } finally { identityLoading.value = false; }
}

function openRecovery() {
  recoveryIdentityVerified.value = false;
  recoveryError.value = "";
  recoveryRequestId.value = createRequestId();
  recoveryOpen.value = true;
}

async function issueRecovery() {
  if (!player.value || !recoveryIdentityVerified.value || !recoveryRequestId.value) return;
  recoveryLoading.value = true;
  recoveryError.value = "";
  try {
    const result = await api<{ contractVersion: "1"; recoveryUrl: string; expiresAt: number }>(`/v1/player-accounts/${encodeURIComponent(player.value.playerAccountId)}/passkey-recovery`, {
      method: "POST",
      headers: { "Idempotency-Key": recoveryRequestId.value },
      body: { contractVersion: "1", identityVerified: true },
    });
    recoveryLink.value = result.recoveryUrl;
    recoveryExpiresAt.value = result.expiresAt;
    recoveryOpen.value = false;
  } catch (error) {
    recoveryError.value = portalErrorDetails(error, "无法签发恢复链接，请稍后重试。").description;
  } finally { recoveryLoading.value = false; }
}

async function copyRecoveryLink() {
  if (!recoveryLink.value || !navigator.clipboard) return;
  await navigator.clipboard.writeText(recoveryLink.value);
  recoveryCopied.value = true;
  window.setTimeout(() => { recoveryCopied.value = false; }, 1600);
}

onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace :title="player ? `${player.playerName}#${player.playerId}` : '玩家详情'">
    <template #actions><UButton :to="`/admin/mastery-runs?playerAccountId=${encodeURIComponent(playerAccountId)}`" label="通关记录" color="neutral" variant="outline" /><UButton to="/admin/players" label="返回玩家列表" color="neutral" variant="outline" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><USkeleton v-else-if="loading" class="detail-loading" /></template>
    <section v-if="player" class="player-detail-page">
      <AdminPlayerDetail :player="player" :loading="actionLoading || identityLoading || recoveryLoading" @set-status="requestStatus" @unbind="requestUnbind" @grant-completed="load" @edit-identity="identityEditorOpen = true" />
      <section class="recovery-panel surface-card" aria-labelledby="recovery-title">
        <div>
          <h2 id="recovery-title">Passkey 恢复</h2>
          <p>核验玩家身份后，可撤销此帐号当前的 Passkey 与 Portal 会话，并签发一次性链接。恢复会回到同一个 Player Account，原有提交、称号和精通记录继续保留。</p>
        </div>
        <UAlert v-if="recoveryError" color="error" variant="subtle" :description="recoveryError" />
        <div v-if="recoveryLink" class="recovery-result">
          <UAlert color="success" variant="subtle" title="一次性恢复链接已签发" :description="recoveryExpiresAt ? `有效至 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(recoveryExpiresAt)}` : undefined" />
          <code>{{ recoveryLink }}</code>
          <UButton :label="recoveryCopied ? '已复制' : '复制恢复链接'" icon="i-lucide-copy" color="neutral" variant="outline" @click="copyRecoveryLink" />
        </div>
        <UButton label="核验并签发恢复链接" icon="i-lucide-key-round" color="warning" variant="soft" :disabled="recoveryLoading || player.status !== 'active'" @click="openRecovery" />
      </section>
    </section>
    <UEmpty v-else-if="!loading" title="找不到该玩家" description="玩家帐号可能已不存在或链接无效。" />
    <AdminResponsiveDialog :open="pendingAction !== null" :title="actionTitle" :description="actionDescription" size="sm" :dismissible="!actionLoading" @update:open="(open) => { if (!open) closeAction(); }">
      <template #body><form v-if="pendingAction" id="player-action" class="player-action" @submit.prevent="confirmAction"><p v-if="pendingAction.type === 'unbind'">解除后，历史提交会保留。</p><template v-else><p>{{ pendingAction.status === 'banned' ? '封禁后，玩家无法继续使用当前帐号。' : '解除后，玩家可以继续使用当前帐号。' }}</p><UFormField v-if="pendingAction.status === 'banned'" label="封禁原因"><UTextarea v-model="banReason" maxlength="256" :disabled="actionLoading" /></UFormField></template></form></template>
      <template #footer><UButton :label="actionTitle" :color="pendingAction?.type === 'unbind' || (pendingAction?.type === 'set-status' && pendingAction.status === 'banned') ? 'error' : 'primary'" :variant="pendingAction?.type === 'unbind' || (pendingAction?.type === 'set-status' && pendingAction.status === 'banned') ? 'soft' : 'solid'" type="submit" form="player-action" :loading="actionLoading" /><UButton label="取消" color="neutral" variant="outline" :disabled="actionLoading" @click="closeAction()" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog v-model:open="recoveryOpen" title="签发 Passkey 恢复链接" :description="actionDescription" size="sm" :dismissible="!recoveryLoading">
      <template #body>
        <div class="recovery-confirm">
          <p>签发后会立即移除此帐号现有 Passkey，并撤销其所有 Portal 会话。玩家完成新 Passkey 注册后仍使用原 Player Account。</p>
          <UCheckbox v-model="recoveryIdentityVerified" label="我已通过独立方式核验玩家身份，并确认恢复到此帐号。" :disabled="recoveryLoading" />
          <UAlert v-if="recoveryError" color="error" variant="subtle" :description="recoveryError" />
        </div>
      </template>
      <template #footer>
        <UButton label="签发一次性链接" color="warning" variant="soft" :loading="recoveryLoading" :disabled="recoveryLoading || !recoveryIdentityVerified" @click="issueRecovery" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="recoveryLoading" @click="recoveryOpen = false" />
      </template>
    </AdminResponsiveDialog>
    <AdminPlayerIdentityEditor v-if="player" v-model:open="identityEditorOpen" :player="player" :loading="identityLoading" @save="updateIdentity" />
  </AdminWorkspace>
</template>

<style scoped>
.detail-loading { width: 100%; height: 120px; }
.player-action { display: grid; gap: var(--space-4); }
.player-action p { margin: 0; color: var(--muted); line-height: 1.55; }
.recovery-panel { display: grid; gap: var(--space-4); margin-top: var(--space-5); padding: var(--space-6); }
.recovery-panel h2 { margin: 0; font-size: var(--type-section-title-size); }
.recovery-panel p, .recovery-confirm p { margin: var(--space-2) 0 0; color: var(--muted); line-height: 1.6; }
.recovery-result { display: grid; gap: var(--space-3); }
.recovery-result code { padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); overflow-wrap: anywhere; background: var(--surface-raised); }
.recovery-confirm { display: grid; gap: var(--space-4); }
</style>
