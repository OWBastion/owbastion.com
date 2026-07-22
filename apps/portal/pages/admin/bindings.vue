<script setup lang="ts">
import BindingInviteBatchPanel from "~/components/admin/BindingInviteBatchPanel.vue";

definePageMeta({ middleware: ["auth", "admin-client"] });
type Claim = { claimId: string; playerName: string; playerId: string; status: "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired"; createdAt: number; invitedBy: string; affectedPlayerAccountId?: string };
type Invitation = { inviteId: string; playerName: string; playerId: string; status: "active" | "redeemed" | "expired" | "revoked"; createdAt: number; expiresAt: number; redeemedAt?: number };
const toast = useToast();
const api = useAdminApi();
const claims = ref<Claim[]>([]); const invitations = ref<Invitation[]>([]); const loading = ref(true); const errorMessage = ref("");
const revokeTarget = ref<Invitation | null>(null); const revokeReason = ref(""); const revoking = ref(false);
const columns = [{ accessorKey: "battleTag", header: "玩家" }, { accessorKey: "status", header: "状态" }, { accessorKey: "createdAt", header: "申请时间" }, { id: "actions", header: "", enableHiding: false }];
const invitationColumns = [{ accessorKey: "battleTag", header: "玩家" }, { accessorKey: "status", header: "状态" }, { accessorKey: "expiresAt", header: "有效期" }, { id: "actions", header: "", enableHiding: false }];
const statusLabel = (status: Claim["status"]) => ({ pending_confirmation: "等待确认", pending_review: "待处理", approved: "已批准", rejected: "已拒绝", expired: "已过期" })[status];
const invitationStatusLabel = (status: Invitation["status"]) => ({ active: "待使用", redeemed: "已确认", expired: "已过期", revoked: "已撤销" })[status];
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
async function load() { loading.value = true; errorMessage.value = ""; try { const [claimResult, invitationResult] = await Promise.all([api<{ items: Claim[] }>("/v1/binding-claims"), api<{ items: Invitation[] }>("/v1/binding-invites")]); claims.value = claimResult.items; invitations.value = invitationResult.items; } catch { errorMessage.value = "无法读取绑定记录，请稍后重试。"; } finally { loading.value = false; } }
async function decide(claim: Claim, decision: "approved" | "rejected") { const action = decision === "approved" ? "批准" : "拒绝"; const reason = window.prompt(`请输入${action}原因`)?.trim(); if (!reason) return; try { await api(`/v1/binding-claims/${claim.claimId}/decision`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", decision, reason } }); toast.add({ title: `申请已${action}`, color: "success" }); await load(); } catch { toast.add({ title: "无法处理申请", color: "error" }); } }
function openRevoke(invitation: Invitation) { revokeTarget.value = invitation; revokeReason.value = ""; }
function closeRevoke() { if (revoking.value) return; revokeTarget.value = null; revokeReason.value = ""; }
async function revokeInvitation() { if (!revokeTarget.value || !revokeReason.value.trim()) return; revoking.value = true; try { await api(`/v1/binding-invites/${revokeTarget.value.inviteId}/revoke`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", reason: revokeReason.value.trim() } }); revokeTarget.value = null; revokeReason.value = ""; toast.add({ title: "邀请码已撤销", color: "success" }); await load(); } catch { toast.add({ title: "无法撤销邀请码", color: "error" }); } finally { revoking.value = false; } }
onMounted(load);
</script>

<template>
  <AdminWorkspace title="绑定管理" :count="loading ? '读取中…' : `${claims.length} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <template #toolbar><BindingInviteBatchPanel @created="load" /></template>
    <section class="binding-section" aria-label="已生成的邀请码">
      <PageSectionHeader title="已生成的邀请码"><template #actions><span class="table-meta">仅显示状态与有效期</span></template></PageSectionHeader>
      <AdminDataTable :data="invitations" :columns="invitationColumns" :loading="loading" empty="暂无邀请码。" table-key="binding-invites">
        <template #battleTag-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
        <template #status-cell="{ row }"><StatusBadge :label="invitationStatusLabel(row.original.status)" :tone="row.original.status === 'active' ? 'warning' : row.original.status === 'redeemed' ? 'success' : 'default'" /></template>
        <template #expiresAt-cell="{ row }"><span class="table-meta">{{ formatDate(row.original.expiresAt) }}</span></template>
        <template #actions-cell="{ row }"><UButton v-if="row.original.status === 'active'" label="撤销" color="error" variant="soft" size="xs" @click="openRevoke(row.original)" /></template>
      </AdminDataTable>
    </section>
    <AdminDataTable :data="claims" :columns="columns" :loading="loading" empty="暂无绑定申请。" table-key="binding-claims">
      <template #battleTag-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
      <template #status-cell="{ row }"><StatusBadge :label="statusLabel(row.original.status)" :tone="row.original.status === 'pending_review' ? 'warning' : row.original.status === 'approved' ? 'success' : 'default'" /></template>
      <template #createdAt-cell="{ row }"><span class="table-meta">{{ new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(row.original.createdAt) }}</span></template>
      <template #actions-cell="{ row }"><div v-if="row.original.status === 'pending_review'" class="claim-actions"><UButton label="批准" size="xs" @click="decide(row.original, 'approved')" /><UButton label="拒绝" color="error" variant="soft" size="xs" @click="decide(row.original, 'rejected')" /></div></template>
    </AdminDataTable>
    <UModal :open="revokeTarget !== null" title="撤销邀请码" :description="revokeTarget ? `${revokeTarget.playerName}#${revokeTarget.playerId}` : undefined" @update:open="(open) => { if (!open) closeRevoke(); }">
      <template #body><form v-if="revokeTarget" id="invite-revoke" class="revoke-form" @submit.prevent="revokeInvitation"><p class="revoke-note">撤销后无法恢复。</p><UFormField label="撤销原因" required><UTextarea v-model="revokeReason" maxlength="256" placeholder="例如：发送对象有误" :disabled="revoking" /></UFormField></form></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="revoking" @click="closeRevoke" /><UButton label="确认撤销" color="error" type="submit" form="invite-revoke" :loading="revoking" :disabled="!revokeReason.trim()" /></template>
    </UModal>
  </AdminWorkspace>
</template>

<style scoped>.binding-section { display:grid; gap:12px; }.claim-actions { display:flex; gap:8px; }.table-meta,.revoke-note { color:var(--quiet); font-size:.78rem; }.revoke-form { display:grid; gap:16px; }</style>
