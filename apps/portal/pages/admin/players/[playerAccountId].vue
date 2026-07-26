<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "玩家详情 · 躲避堡垒 3" });

const route = useRoute();
const api = useAdminApi();
const toast = useToast();
const player = shallowRef<AdminPlayerDetail | null>(null);
const loading = shallowRef(true);
const actionLoading = shallowRef(false);
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
    await api(`/v1/player-accounts/${player.value.playerAccountId}/status`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", status: next, ...(reason ? { reason } : {}) } });
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
    await api(`/v1/bindings/${bindingId}`, { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } });
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

onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace :title="player ? `${player.playerName}#${player.playerId}` : '玩家详情'" :count="player ? (player.status === 'banned' ? '已封禁' : '正常') : undefined">
    <template #actions><NuxtLink class="back-link" to="/admin/players">返回玩家列表</NuxtLink></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><USkeleton v-else-if="loading" class="detail-loading" /></template>
    <section v-if="player" class="player-detail-page"><AdminPlayerDetail :player="player" :loading="actionLoading" @set-status="requestStatus" @unbind="requestUnbind" @grant-completed="load" /></section>
    <UEmpty v-else-if="!loading" title="找不到该玩家" description="玩家帐号可能已不存在或链接无效。" />
    <AdminResponsiveDialog :open="pendingAction !== null" :title="actionTitle" :description="actionDescription" size="sm" :dismissible="!actionLoading" @update:open="(open) => { if (!open) closeAction(); }">
      <template #body><form v-if="pendingAction" id="player-action" class="player-action" @submit.prevent="confirmAction"><p v-if="pendingAction.type === 'unbind'">解除后，历史提交会保留。</p><template v-else><p>{{ pendingAction.status === 'banned' ? '封禁后，玩家无法继续使用当前帐号。' : '解除后，玩家可以继续使用当前帐号。' }}</p><UFormField v-if="pendingAction.status === 'banned'" label="封禁原因"><UTextarea v-model="banReason" maxlength="256" placeholder="可选" :disabled="actionLoading" /></UFormField></template></form></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="actionLoading" @click="closeAction()" /><UButton :label="actionTitle" :color="pendingAction?.type === 'set-status' && pendingAction.status === 'banned' ? 'error' : 'primary'" type="submit" form="player-action" :loading="actionLoading" /></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.back-link { color:var(--accent); font-size:.8rem; font-weight:650; text-decoration:none; }.back-link:hover { text-decoration:underline; }.player-detail-page { max-width:960px; }.detail-loading { width:100%; height:120px; }.player-action { display:grid; gap:16px; }.player-action p { margin:0; color:var(--muted); line-height:1.55; }
</style>
