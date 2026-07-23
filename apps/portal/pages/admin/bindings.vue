<script setup lang="ts">
import type { TabsItem } from "@nuxt/ui";
import BindingInviteBatchPanel from "~/components/admin/BindingInviteBatchPanel.vue";
import { bindingInviteCopyText } from "~/utils/binding-invite";

definePageMeta({ middleware: ["auth", "admin-client"] });
type Claim = { claimId: string; playerName: string; playerId: string; status: "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired"; createdAt: number; invitedBy: string; affectedPlayerAccountId?: string };
type Invitation = { inviteId: string; playerName: string; playerId: string; status: "active" | "redeemed" | "expired" | "revoked"; codeAvailable: boolean; createdAt: number; expiresAt: number; redeemedAt?: number };
const toast = useToast();
const api = useAdminApi();
const claims = ref<Claim[]>([]); const invitations = ref<Invitation[]>([]); const loading = ref(true); const errorMessage = ref("");
const revokeTarget = ref<Invitation | null>(null); const revokeReason = ref(""); const revoking = ref(false);
const codeTarget = shallowRef<Invitation | null>(null); const invitationCode = shallowRef(""); const revealingCode = shallowRef(false);
const activeTab = shallowRef("claims");
const bindingTabs = [
  { label: "绑定申请", value: "claims", slot: "claims" as const },
  { label: "已生成邀请码", value: "invitations", slot: "invitations" as const },
  { label: "批量生成", value: "batch", slot: "batch" as const },
] satisfies TabsItem[];
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
function closeCode() { if (revealingCode.value) return; codeTarget.value = null; invitationCode.value = ""; }
async function revealCode(invitation: Invitation) { codeTarget.value = invitation; invitationCode.value = ""; revealingCode.value = true; try { const response = await api<{ code: string }>(`/v1/binding-invites/${invitation.inviteId}/code`); invitationCode.value = response.code; } catch { codeTarget.value = null; toast.add({ title: "无法读取邀请码", color: "error" }); } finally { revealingCode.value = false; } }
async function copyInvitationCode() { if (!invitationCode.value) return; try { await navigator.clipboard.writeText(bindingInviteCopyText(invitationCode.value, window.location.origin)); toast.add({ title: "已复制绑定口令", color: "success" }); } catch { toast.add({ title: "无法复制口令", color: "error" }); } }
onMounted(load);
</script>

<template>
  <AdminWorkspace title="绑定管理" :count="loading ? '读取中…' : `${claims.length} 条`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section class="binding-section" aria-label="绑定记录">
      <UTabs v-model="activeTab" :items="bindingTabs" variant="link" aria-label="绑定记录类型" class="binding-tabs">
        <template #claims>
          <AdminDataTable :data="claims" :columns="columns" :loading="loading" empty="暂无绑定申请。" table-key="binding-claims">
            <template #battleTag-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
            <template #status-cell="{ row }"><StatusBadge :label="statusLabel(row.original.status)" :tone="row.original.status === 'pending_review' ? 'warning' : row.original.status === 'approved' ? 'success' : 'default'" /></template>
            <template #createdAt-cell="{ row }"><span class="table-meta">{{ formatDate(row.original.createdAt) }}</span></template>
            <template #actions-cell="{ row }"><div v-if="row.original.status === 'pending_review'" class="claim-actions"><UButton label="批准" size="xs" @click="decide(row.original, 'approved')" /><UButton label="拒绝" color="error" variant="soft" size="xs" @click="decide(row.original, 'rejected')" /></div></template>
          </AdminDataTable>
        </template>
        <template #invitations>
          <AdminDataTable :data="invitations" :columns="invitationColumns" :loading="loading" empty="暂无邀请码。" table-key="binding-invites">
            <template #battleTag-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
            <template #status-cell="{ row }"><StatusBadge :label="invitationStatusLabel(row.original.status)" :tone="row.original.status === 'active' ? 'warning' : row.original.status === 'redeemed' ? 'success' : 'default'" /></template>
            <template #expiresAt-cell="{ row }"><span class="table-meta">{{ formatDate(row.original.expiresAt) }}</span></template>
            <template #actions-cell="{ row }"><div v-if="row.original.status === 'active'" class="invite-actions"><UButton v-if="row.original.codeAvailable" label="查看" color="neutral" variant="outline" size="xs" @click="revealCode(row.original)" /><span v-else class="table-meta">需重新生成</span><UButton label="撤销" color="error" variant="soft" size="xs" @click="openRevoke(row.original)" /></div></template>
          </AdminDataTable>
        </template>
        <template #batch>
          <BindingInviteBatchPanel @created="load" />
        </template>
      </UTabs>
    </section>
    <UModal :open="revokeTarget !== null" title="撤销邀请码" :description="revokeTarget ? `${revokeTarget.playerName}#${revokeTarget.playerId}` : undefined" @update:open="(open) => { if (!open) closeRevoke(); }">
      <template #body><form v-if="revokeTarget" id="invite-revoke" class="revoke-form" @submit.prevent="revokeInvitation"><p class="revoke-note">撤销后无法恢复。</p><UFormField label="撤销原因" required><UTextarea v-model="revokeReason" maxlength="256" placeholder="例如：发送对象有误" :disabled="revoking" /></UFormField></form></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="revoking" @click="closeRevoke" /><UButton label="确认撤销" color="error" type="submit" form="invite-revoke" :loading="revoking" :disabled="!revokeReason.trim()" /></template>
    </UModal>
    <UModal :open="codeTarget !== null" title="邀请码" :description="codeTarget ? `${codeTarget.playerName}#${codeTarget.playerId}` : undefined" @update:open="(open) => { if (!open) closeCode(); }">
      <template #body><div class="invite-code"><span v-if="revealingCode" class="table-meta">读取中…</span><code v-else>{{ invitationCode }}</code></div></template>
      <template #footer><UButton label="关闭" color="neutral" variant="outline" :disabled="revealingCode" @click="closeCode" /><UButton label="复制口令" :disabled="!invitationCode" @click="copyInvitationCode" /></template>
    </UModal>
  </AdminWorkspace>
</template>

<style scoped>.binding-section,.binding-tabs { display:grid; gap:12px; }.claim-actions,.invite-actions { display:flex; gap:8px; }.table-meta,.revoke-note { color:var(--quiet); font-size:.78rem; }.revoke-form { display:grid; gap:16px; }.invite-code { display:grid; min-height:56px; place-items:center; border:1px solid var(--line); border-radius:12px; background:var(--surface-raised); }.invite-code code { color:var(--accent); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:1.1rem; font-weight:700; letter-spacing:.12em; }</style>
