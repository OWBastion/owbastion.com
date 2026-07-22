<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
type Claim = { claimId: string; playerName: string; playerId: string; status: "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired"; createdAt: number; invitedBy: string; affectedPlayerAccountId?: string };
const api = useAdminApi();
const claims = ref<Claim[]>([]); const loading = ref(true); const errorMessage = ref(""); const actionMessage = ref("");
const inviteName = ref(""); const invitePlayerId = ref(""); const inviteCode = ref("");
const columns = [{ accessorKey: "battleTag", header: "玩家" }, { accessorKey: "status", header: "状态" }, { accessorKey: "createdAt", header: "申请时间" }, { id: "actions", header: "", enableHiding: false }];
const statusLabel = (status: Claim["status"]) => ({ pending_confirmation: "等待确认", pending_review: "待处理", approved: "已批准", rejected: "已拒绝", expired: "已过期" })[status];
async function load() { loading.value = true; errorMessage.value = ""; try { claims.value = (await api<{ items: Claim[] }>("/v1/binding-claims")).items; } catch { errorMessage.value = "无法读取绑定申请，请稍后重试。"; } finally { loading.value = false; } }
async function createInvite() { actionMessage.value = "保存中…"; try { const result = await api<{ code: string }>("/v1/binding-invites", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", playerName: inviteName.value.trim(), playerId: invitePlayerId.value.trim() } }); inviteCode.value = result.code; actionMessage.value = "邀请码已生成"; } catch { actionMessage.value = "无法生成邀请码"; } }
async function decide(claim: Claim, decision: "approved" | "rejected") { const action = decision === "approved" ? "批准" : "拒绝"; const reason = window.prompt(`请输入${action}原因`)?.trim(); if (!reason) return; actionMessage.value = "保存中…"; try { await api(`/v1/binding-claims/${claim.claimId}/decision`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", decision, reason } }); actionMessage.value = `申请已${action}`; await load(); } catch { actionMessage.value = "无法处理申请"; } }
onMounted(load);
</script>

<template>
  <AdminWorkspace title="绑定管理" :count="loading ? '读取中…' : `${claims.length} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><UAlert v-if="actionMessage" color="primary" variant="subtle" :description="actionMessage" /></template>
    <template #toolbar><form class="admin-toolbar" @submit.prevent="createInvite"><UInput v-model="inviteName" aria-label="玩家名称" placeholder="玩家名称" required /><UInput v-model="invitePlayerId" aria-label="数字 ID" placeholder="数字 ID" inputmode="numeric" required /><UButton type="submit" label="生成邀请码" /><span v-if="inviteCode" class="invite-code">{{ inviteCode }}</span></form></template>
    <AdminDataTable :data="claims" :columns="columns" :loading="loading" empty="暂无绑定申请。" table-key="binding-claims" scroll-height="32rem">
      <template #battleTag-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
      <template #status-cell="{ row }"><StatusBadge :label="statusLabel(row.original.status)" :tone="row.original.status === 'pending_review' ? 'warning' : row.original.status === 'approved' ? 'success' : 'default'" /></template>
      <template #createdAt-cell="{ row }"><span class="table-meta">{{ new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(row.original.createdAt) }}</span></template>
      <template #actions-cell="{ row }"><div v-if="row.original.status === 'pending_review'" class="claim-actions"><UButton label="批准" size="xs" @click="decide(row.original, 'approved')" /><UButton label="拒绝" color="error" variant="soft" size="xs" @click="decide(row.original, 'rejected')" /></div></template>
    </AdminDataTable>
  </AdminWorkspace>
</template>

<style scoped>
.invite-code { align-self:center; padding:8px 10px; border:1px solid var(--line); border-radius:8px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing:.05em; }.claim-actions { display:flex; gap:8px; }.table-meta { color:var(--quiet); font-size:.78rem; } @media (max-width:620px) { .invite-code { width:100%; } }
</style>
