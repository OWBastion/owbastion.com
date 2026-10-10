<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

const route = useRoute();
const api = useAdminApi();
const toast = useToast();
const revision = useState("admin-players-revision", () => 0);
const player = shallowRef<AdminPlayerDetail | null>(null);
const actionLoading = shallowRef(false);
const identityEditorOpen = shallowRef(false);
const recoveryOpen = shallowRef(false);
const errorMessage = shallowRef("");
const pendingAction = shallowRef<{ type: "set-status"; status: "active" | "banned" } | { type: "unbind"; bindingId: string } | null>(null);
const banReason = shallowRef("");
const playerAccountId = computed(() => String(route.params.playerAccountId));
const actionTitle = computed(() => pendingAction.value?.type === "unbind" ? "解除 QQ 绑定" : pendingAction.value?.status === "banned" ? "封禁玩家" : "解除封禁");
const actionDescription = computed(() => player.value ? `${player.value.playerName}#${player.value.playerId}` : undefined);
const destructive = computed(() => pendingAction.value?.type === "unbind" || (pendingAction.value?.type === "set-status" && pendingAction.value.status === "banned"));

watch(playerAccountId, () => { player.value = null; errorMessage.value = ""; }, { flush: "sync" });

const adminData = useAdminAsyncData("player-detail", () => api<AdminPlayerDetail>(`/v1/player-accounts/${encodeURIComponent(playerAccountId.value)}`), {
  cacheKey: playerAccountId,
  onStart: () => { errorMessage.value = ""; },
  onData: (response) => { player.value = response; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取玩家详情，请稍后重试。").description; },
});
const loading = adminData.loading;
/** Reloads this player and the list row beside it, which carries the same status and pending count. */
async function load() { errorMessage.value = ""; revision.value += 1; await adminData.refresh(); }
function requestStatus(status: "active" | "banned") { banReason.value = ""; pendingAction.value = { type: "set-status", status }; }
function requestUnbind(bindingId: string) { pendingAction.value = { type: "unbind", bindingId }; }
function closeAction(force = false) { if (actionLoading.value && !force) return; pendingAction.value = null; banReason.value = ""; }

async function runAction(failure: string, success: string, request: () => Promise<unknown>) {
  actionLoading.value = true;
  try {
    await request();
    toast.add({ title: success, color: "success" });
    closeAction(true);
    await load();
  } catch (error) { toast.add({ title: failure, description: portalErrorDetails(error).description, color: "error" }); }
  finally { actionLoading.value = false; }
}
function confirmAction() {
  const action = pendingAction.value;
  const current = player.value;
  if (!action || !current) return;
  if (action.type === "unbind") {
    void runAction("无法解除 QQ 绑定", "QQ 绑定已解除", () => api(`/v1/bindings/${action.bindingId}`, { method: "DELETE", headers: { "Idempotency-Key": createRequestId() } }));
    return;
  }
  const reason = banReason.value.trim();
  void runAction("无法更新玩家状态", action.status === "banned" ? "玩家已封禁" : "玩家已解封", () => api(`/v1/player-accounts/${current.playerAccountId}/status`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", status: action.status, ...(reason ? { reason } : {}) } }));
}
async function updateIdentity(playerName: string) {
  const current = player.value;
  if (!current) return;
  actionLoading.value = true;
  try {
    await api(`/v1/player-accounts/${current.playerAccountId}/identity`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", playerName } });
    toast.add({ title: "战网 ID 已更新", color: "success" });
    identityEditorOpen.value = false;
    await load();
  } catch (error) {
    toast.add({ title: "无法更新战网 ID", description: portalErrorDetails(error).description, color: "error" });
  } finally { actionLoading.value = false; }
}
</script>

<template>
  <div>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    <USkeleton v-else-if="loading && !player" class="detail-loading" />
    <AdminPlayerDetail v-if="player && !errorMessage" :player="player" :loading="actionLoading" @set-status="requestStatus" @unbind="requestUnbind" @changed="load" @edit-identity="identityEditorOpen = true" @issue-recovery="recoveryOpen = true" />
    <UEmpty v-else-if="!loading && !errorMessage" title="找不到该玩家" description="玩家帐号可能已不存在或链接无效。" />
    <AdminResponsiveDialog :open="pendingAction !== null" :title="actionTitle" :description="actionDescription" size="sm" :dismissible="!actionLoading" @update:open="(open) => { if (!open) closeAction(); }">
      <template #body>
        <form v-if="pendingAction" id="player-action" class="player-action" @submit.prevent="confirmAction">
          <p v-if="pendingAction.type === 'unbind'">解除后，历史提交会保留。</p>
          <template v-else>
            <p>{{ pendingAction.status === 'banned' ? '封禁后，玩家无法继续使用当前帐号。' : '解除后，玩家可以继续使用当前帐号。' }}</p>
            <UFormField v-if="pendingAction.status === 'banned'" label="封禁原因"><UTextarea v-model="banReason" maxlength="256" :disabled="actionLoading" /></UFormField>
          </template>
        </form>
      </template>
      <template #footer><UButton :label="actionTitle" :color="destructive ? 'error' : 'primary'" :variant="destructive ? 'soft' : 'solid'" type="submit" form="player-action" :loading="actionLoading" /><UButton label="取消" color="neutral" variant="outline" :disabled="actionLoading" @click="closeAction()" /></template>
    </AdminResponsiveDialog>
    <AdminPlayerRecovery v-if="player" v-model:open="recoveryOpen" :player="player" />
    <AdminPlayerIdentityEditor v-if="player" v-model:open="identityEditorOpen" :player="player" :loading="actionLoading" @save="updateIdentity" />
  </div>
</template>

<style scoped>
.detail-loading { width: 100%; height: 120px; }
.player-action { display: grid; gap: var(--space-4); }
.player-action p { margin: 0; color: var(--muted); line-height: 1.55; }
</style>
