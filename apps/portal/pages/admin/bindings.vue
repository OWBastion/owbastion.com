<script setup lang="ts">
import type { TabsItem } from "@nuxt/ui";
import BindingInviteBatchPanel from "~/components/admin/BindingInviteBatchPanel.vue";
import { bindingInviteCopyText } from "~/utils/binding-invite";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });

type Claim = {
  claimId: string;
  playerName: string;
  playerId: string;
  status: "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired";
  createdAt: number;
  invitedBy: string;
  memberOpenId?: string;
  groupOpenId?: string;
  affectedPlayerAccountId?: string;
  targetAccountBinding?: { bindingId: string; memberOpenId: string; groupOpenId?: string };
  qqBoundAccounts?: Array<{ playerAccountId: string; playerName: string; playerId: string }>;
  revokingBindingCount?: number;
  invalidatingSessionCount?: number;
  operationType?: "initial_binding" | "rebind_account" | "qq_transfer" | "conflict";
};
type Invitation = { inviteId: string; playerName: string; playerId: string; status: "active" | "redeemed" | "expired" | "revoked"; codeAvailable: boolean; createdAt: number; expiresAt: number; redeemedAt?: number };

const toast = useToast();
const api = useAdminApi();
const claims = ref<Claim[]>([]);
const invitations = ref<Invitation[]>([]);
const loading = ref(true);
const errorMessage = ref("");

const revokeTarget = ref<Invitation | null>(null);
const revokeReason = ref("");
const revoking = ref(false);

const codeTarget = shallowRef<Invitation | null>(null);
const invitationCode = shallowRef("");
const revealingCode = shallowRef(false);

const detailTarget = ref<Claim | null>(null);
const conflictTarget = ref<Claim | null>(null);
const deciding = ref(false);

const activeTab = shallowRef("claims");
const bindingTabs = [
  { label: "绑定申请", value: "claims", slot: "claims" as const },
  { label: "已生成邀请码", value: "invitations", slot: "invitations" as const },
  { label: "批量生成", value: "batch", slot: "batch" as const },
] satisfies TabsItem[];

const columns = [
  { accessorKey: "battleTag", header: "玩家" },
  { accessorKey: "operationType", header: "类型" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "createdAt", header: "申请时间" },
  { id: "actions", header: "", enableHiding: false },
];
const invitationColumns = [
  { accessorKey: "battleTag", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "expiresAt", header: "有效期" },
  { id: "actions", header: "", enableHiding: false },
];

const statusLabel = (status: Claim["status"]) => ({ pending_confirmation: "等待确认", pending_review: "待处理", approved: "已批准", rejected: "已拒绝", expired: "已过期" })[status];
const invitationStatusLabel = (status: Invitation["status"]) => ({ active: "待使用", redeemed: "已确认", expired: "已过期", revoked: "已撤销" })[status];
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);

const operationTypeLabel = (type?: Claim["operationType"]) => {
  switch (type) {
    case "conflict":
      return "冲突";
    case "rebind_account":
      return "换绑";
    case "qq_transfer":
      return "QQ 身份迁移";
    case "initial_binding":
    default:
      return "首次绑定";
  }
};
const operationTypeTone = (type?: Claim["operationType"]) => {
  switch (type) {
    case "conflict":
    case "rebind_account":
    case "qq_transfer":
      return "warning" as const;
    case "initial_binding":
    default:
      return "default" as const;
  }
};

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [claimResult, invitationResult] = await Promise.all([
      api<{ items: Claim[] }>("/v1/binding-claims"),
      api<{ items: Invitation[] }>("/v1/binding-invites"),
    ]);
    claims.value = claimResult.items;
    invitations.value = invitationResult.items;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取绑定记录，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

function handleApprove(claim: Claim) {
  if (claim.operationType === "conflict") {
    conflictTarget.value = claim;
  } else {
    decide(claim, "approved");
  }
}

async function decide(claim: Claim, decision: "approved" | "rejected") {
  const action = decision === "approved" ? "批准" : "拒绝";
  deciding.value = true;
  try {
    await api(`/v1/binding-claims/${claim.claimId}/decision`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", decision },
    });
    toast.add({ title: `申请已${action}`, color: "success" });
    conflictTarget.value = null;
    detailTarget.value = null;
    await load();
  } catch (error) {
    toast.add({ title: "无法处理申请", description: portalErrorDetails(error).description, color: "error" });
  } finally {
    deciding.value = false;
  }
}

function openRevoke(invitation: Invitation) {
  revokeTarget.value = invitation;
  revokeReason.value = "";
}
function closeRevoke() {
  if (revoking.value) return;
  revokeTarget.value = null;
  revokeReason.value = "";
}
async function revokeInvitation() {
  if (!revokeTarget.value) return;
  revoking.value = true;
  try {
    const reason = revokeReason.value.trim();
    await api(`/v1/binding-invites/${revokeTarget.value.inviteId}/revoke`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", ...(reason ? { reason } : {}) },
    });
    revokeTarget.value = null;
    revokeReason.value = "";
    toast.add({ title: "邀请码已撤销", color: "success" });
    await load();
  } catch (error) {
    toast.add({ title: "无法撤销邀请码", description: portalErrorDetails(error).description, color: "error" });
  } finally {
    revoking.value = false;
  }
}

function closeCode() {
  if (revealingCode.value) return;
  codeTarget.value = null;
  invitationCode.value = "";
}
async function revealCode(invitation: Invitation) {
  codeTarget.value = invitation;
  invitationCode.value = "";
  revealingCode.value = true;
  try {
    const response = await api<{ code: string }>(`/v1/binding-invites/${invitation.inviteId}/code`);
    invitationCode.value = response.code;
  } catch (error) {
    codeTarget.value = null;
    toast.add({ title: "无法读取邀请码", description: portalErrorDetails(error).description, color: "error" });
  } finally {
    revealingCode.value = false;
  }
}
async function copyInvitationCode() {
  if (!invitationCode.value) return;
  try {
    await navigator.clipboard.writeText(bindingInviteCopyText(invitationCode.value, window.location.origin));
    toast.add({ title: "已复制绑定口令", color: "success" });
  } catch {
    toast.add({ title: "无法复制口令", color: "error" });
  }
}

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
            <template #operationType-cell="{ row }"><StatusBadge :label="operationTypeLabel(row.original.operationType)" :tone="operationTypeTone(row.original.operationType)" /></template>
            <template #status-cell="{ row }"><StatusBadge :label="statusLabel(row.original.status)" :tone="row.original.status === 'pending_review' ? 'warning' : row.original.status === 'approved' ? 'success' : 'default'" /></template>
            <template #createdAt-cell="{ row }"><span class="table-meta">{{ formatDate(row.original.createdAt) }}</span></template>
            <template #actions-cell="{ row }">
              <div class="claim-actions">
                <UButton label="详情" color="neutral" variant="outline" size="xs" @click="detailTarget = row.original" />
                <template v-if="row.original.status === 'pending_review'">
                  <UButton label="批准" size="xs" :disabled="deciding" @click="handleApprove(row.original)" />
                  <UButton label="拒绝" color="error" variant="soft" size="xs" :disabled="deciding" @click="decide(row.original, 'rejected')" />
                </template>
              </div>
            </template>
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

    <AdminResponsiveDialog :open="detailTarget !== null" title="绑定申请详情" :description="detailTarget ? `${detailTarget.playerName}#${detailTarget.playerId}` : undefined" size="md" @update:open="(open) => { if (!open) detailTarget = null; }">
      <template #body>
        <div v-if="detailTarget" class="claim-detail-list">
          <div class="detail-row">
            <span class="detail-label">操作类型</span>
            <StatusBadge :label="operationTypeLabel(detailTarget.operationType)" :tone="operationTypeTone(detailTarget.operationType)" />
          </div>
          <div class="detail-row">
            <span class="detail-label">目标战网账号当前绑定</span>
            <span class="detail-value">{{ detailTarget.targetAccountBinding ? detailTarget.targetAccountBinding.memberOpenId : "无" }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">该 QQ 当前绑定的战网账号</span>
            <span class="detail-value">
              <template v-if="detailTarget.qqBoundAccounts && detailTarget.qqBoundAccounts.length > 0">
                <span v-for="acc in detailTarget.qqBoundAccounts" :key="acc.playerAccountId" class="qq-bound-item">{{ acc.playerName }}#{{ acc.playerId }}</span>
              </template>
              <template v-else>无</template>
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">将撤销的 binding 数量</span>
            <span class="detail-value">{{ detailTarget.revokingBindingCount ?? 0 }} 个</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">将失效的 Session 数量</span>
            <span class="detail-value">{{ detailTarget.invalidatingSessionCount ?? 0 }} 个</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">申请状态</span>
            <StatusBadge :label="statusLabel(detailTarget.status)" :tone="detailTarget.status === 'pending_review' ? 'warning' : detailTarget.status === 'approved' ? 'success' : 'default'" />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton label="关闭" color="neutral" variant="outline" @click="detailTarget = null" />
        <template v-if="detailTarget && detailTarget.status === 'pending_review'">
          <UButton label="批准" :disabled="deciding" @click="handleApprove(detailTarget)" />
          <UButton label="拒绝" color="error" variant="soft" :disabled="deciding" @click="decide(detailTarget, 'rejected')" />
        </template>
      </template>
    </AdminResponsiveDialog>

    <AdminResponsiveDialog :open="conflictTarget !== null" title="确认批准冲突申请" :description="conflictTarget ? `${conflictTarget.playerName}#${conflictTarget.playerId}` : undefined" size="md" :dismissible="!deciding" @update:open="(open) => { if (!open && !deciding) conflictTarget = null; }">
      <template #body>
        <div v-if="conflictTarget" class="claim-detail-list">
          <UAlert color="warning" variant="subtle" title="身份冲突提示" description="批准此操作将撤销现有的关联绑定并导致相关 Session 失效。" />
          <div class="detail-row">
            <span class="detail-label">操作类型</span>
            <StatusBadge :label="operationTypeLabel(conflictTarget.operationType)" :tone="operationTypeTone(conflictTarget.operationType)" />
          </div>
          <div class="detail-row">
            <span class="detail-label">目标战网账号当前绑定</span>
            <span class="detail-value">{{ conflictTarget.targetAccountBinding ? conflictTarget.targetAccountBinding.memberOpenId : "无" }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">该 QQ 当前绑定的战网账号</span>
            <span class="detail-value">
              <template v-if="conflictTarget.qqBoundAccounts && conflictTarget.qqBoundAccounts.length > 0">
                <span v-for="acc in conflictTarget.qqBoundAccounts" :key="acc.playerAccountId" class="qq-bound-item">{{ acc.playerName }}#{{ acc.playerId }}</span>
              </template>
              <template v-else>无</template>
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">将撤销的 binding 数量</span>
            <span class="detail-value">{{ conflictTarget.revokingBindingCount ?? 0 }} 个</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">将失效的 Session 数量</span>
            <span class="detail-value">{{ conflictTarget.invalidatingSessionCount ?? 0 }} 个</span>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="deciding" @click="conflictTarget = null" />
        <UButton label="确认批准" color="error" :loading="deciding" @click="decide(conflictTarget!, 'approved')" />
      </template>
    </AdminResponsiveDialog>

    <AdminResponsiveDialog :open="revokeTarget !== null" title="撤销邀请码" :description="revokeTarget ? `${revokeTarget.playerName}#${revokeTarget.playerId}` : undefined" size="sm" :dismissible="!revoking" @update:open="(open) => { if (!open) closeRevoke(); }">
      <template #body><form v-if="revokeTarget" id="invite-revoke" class="revoke-form" @submit.prevent="revokeInvitation"><p class="revoke-note">撤销后无法恢复。</p><UFormField label="撤销原因"><UTextarea v-model="revokeReason" maxlength="256" placeholder="例如：发送对象有误" :disabled="revoking" /></UFormField></form></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="revoking" @click="closeRevoke" /><UButton label="确认撤销" color="error" type="submit" form="invite-revoke" :loading="revoking" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog :open="codeTarget !== null" title="邀请码" :description="codeTarget ? `${codeTarget.playerName}#${codeTarget.playerId}` : undefined" size="sm" :dismissible="!revealingCode" @update:open="(open) => { if (!open) closeCode(); }">
      <template #body><div class="invite-code"><span v-if="revealingCode" class="table-meta">读取中…</span><code v-else>{{ invitationCode }}</code></div></template>
      <template #footer><UButton label="关闭" color="neutral" variant="outline" :disabled="revealingCode" @click="closeCode" /><UButton label="复制口令" :disabled="!invitationCode" @click="copyInvitationCode" /></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.binding-section,.binding-tabs { display:grid; gap:12px; }
.claim-actions,.invite-actions { display:flex; gap:8px; }
.table-meta,.revoke-note { color:var(--quiet); font-size:.78rem; }
.revoke-form { display:grid; gap:16px; }
.invite-code { display:grid; min-height:56px; place-items:center; border:1px solid var(--line); border-radius:12px; background:var(--surface-raised); }
.invite-code code { color:var(--accent); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:1.1rem; font-weight:700; letter-spacing:.12em; }
.claim-detail-list { display: grid; gap: 12px; }
.detail-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 0.88rem; }
.detail-label { color: var(--muted); }
.detail-value { font-weight: 500; word-break: break-all; }
.qq-bound-item { display: inline-block; }
</style>
