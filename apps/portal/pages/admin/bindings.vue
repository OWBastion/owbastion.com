<script setup lang="ts">
import type { TabsItem } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import type { AdminBindingClaim, AdminBindingInvitation } from "~/composables/useAdminApi";
import BindingInvitePanel from "~/components/admin/BindingInvitePanel.vue";
import BindingInviteBatchPanel from "~/components/admin/BindingInviteBatchPanel.vue";
import { bindingInviteCopyText } from "~/utils/binding-invite";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });

type HistoricalMigration = AdminBindingInvitation["historicalMigration"];

const toast = useToast();
const api = useAdminApi();
const route = useRoute();
const router = useRouter();
const claims = ref<AdminBindingClaim[]>([]);
const invitations = ref<AdminBindingInvitation[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const claimStatus = ref<"pending_review" | "all">("pending_review");

const revokeTarget = ref<AdminBindingInvitation | null>(null);
const revokeReason = ref("");
const revoking = ref(false);

const codeTarget = shallowRef<AdminBindingInvitation | null>(null);
const invitationCode = shallowRef("");
const revealingCode = shallowRef(false);

const detailTarget = ref<AdminBindingClaim | null>(null);
const conflictTarget = ref<AdminBindingClaim | null>(null);
const rejectTarget = ref<AdminBindingClaim | null>(null);
const deciding = ref(false);

/* A-04 — briefly flash a row after an in-place update so the change is
   visible without reloading the whole page. */
const updatedClaimIds = new Set<string>();
const updatedInviteIds = new Set<string>();
function flashRow(id: string, updatedIds: Set<string>) {
  updatedIds.add(id);
  window.setTimeout(() => updatedIds.delete(id), 420);
}

const bindingTabValues = ["claims", "invitations", "create", "batch"] as const;
type BindingTab = (typeof bindingTabValues)[number];
const tabFromRoute = (value: unknown): BindingTab => typeof value === "string" && bindingTabValues.includes(value as BindingTab) ? value as BindingTab : "claims";
const activeTab = shallowRef(tabFromRoute(route.query.tab));
watch(() => route.query.tab, (value) => {
  const next = tabFromRoute(value);
  if (next !== activeTab.value) activeTab.value = next;
});
watch(activeTab, (value) => {
  const query = { ...route.query };
  if (value === "claims") delete query.tab;
  else query.tab = value;
  if (JSON.stringify(query) !== JSON.stringify(route.query)) void router.replace({ path: route.path, query }).catch(() => {});
});
const visibleClaims = computed(() => claimStatus.value === "pending_review" ? claims.value.filter((claim) => claim.status === "pending_review") : claims.value);
const workspaceCount = computed(() => {
  if (loading.value) return "读取中…";
  if (activeTab.value === "claims") return `${visibleClaims.value.length} 条`;
  if (activeTab.value === "invitations") return `${invitations.value.length} 条`;
  return undefined;
});
const bindingTabs = [
  { label: "绑定例外", value: "claims", slot: "claims" as const },
  { label: "邀请与迁移", value: "invitations", slot: "invitations" as const },
  { label: "定向邀请", value: "create", slot: "create" as const },
  { label: "批量生成", value: "batch", slot: "batch" as const },
] satisfies TabsItem[];

const defaultClaimSorting: SortingState = [{ id: "createdAt", desc: true }];
const claimSorting = shallowRef<SortingState>([...defaultClaimSorting]);
const claimSortingOptions = [
  { id: "playerName", label: "玩家" },
  { id: "operationType", label: "类型" },
  { id: "status", label: "状态" },
  { id: "createdAt", label: "申请时间" },
];
const defaultInvitationSorting: SortingState = [{ id: "expiresAt", desc: false }];
const invitationSorting = shallowRef<SortingState>([...defaultInvitationSorting]);
const invitationSortingOptions = [
  { id: "playerName", label: "玩家" },
  { id: "status", label: "状态" },
  { id: "expiresAt", label: "有效期" },
];
const columns = [
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "operationType", header: "类型" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "createdAt", header: "申请时间" },
  { id: "actions", header: "", enableHiding: false },
];
const invitationColumns = [
  { accessorKey: "playerName", header: "玩家" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "historicalMigration", header: "历史称号" },
  { accessorKey: "expiresAt", header: "有效期" },
  { id: "actions", header: "", enableHiding: false },
];
const statusLabel = (status: AdminBindingClaim["status"]) => ({ pending_confirmation: "等待确认", pending_review: "待处理", approved: "已批准", rejected: "已拒绝", expired: "已过期" })[status];
const invitationStatusLabel = (status: AdminBindingInvitation["status"]) => ({ active: "待使用", redeemed: "已确认", expired: "已过期", revoked: "已撤销" })[status];
const historicalMigrationLabel = (migration: HistoricalMigration) => ({ not_requested: "未请求", authorized: `已授权 · ${migration.requestedCount} 项`, completed: `已完成 · ${migration.completedCount} 项`, partial: `部分完成 · ${migration.completedCount}/${migration.requestedCount}`, retry_required: "需重试", cancelled: "已取消" })[migration.status];
const historicalMigrationTone = (migration: HistoricalMigration) => migration.status === "completed" ? "success" as const : migration.status === "retry_required" || migration.status === "partial" ? "warning" as const : "default" as const;
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);

const operationTypeLabel = (type?: AdminBindingClaim["operationType"]) => {
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
const operationTypeTone = (type?: AdminBindingClaim["operationType"]) => {
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
      api<{ items: AdminBindingClaim[] }>("/v1/binding-claims"),
      api<{ items: AdminBindingInvitation[] }>("/v1/binding-invites"),
    ]);
    claims.value = claimResult.items;
    invitations.value = invitationResult.items;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取绑定记录，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

function handleApprove(claim: AdminBindingClaim) {
  if (claim.operationType === "conflict") {
    conflictTarget.value = claim;
  } else {
    decide(claim, "approved");
  }
}
function handleReject(claim: AdminBindingClaim) {
  rejectTarget.value = claim;
}

async function decide(claim: AdminBindingClaim, decision: "approved" | "rejected") {
  const action = decision === "approved" ? "批准" : "拒绝";
  deciding.value = true;
  try {
    await api(`/v1/binding-claims/${claim.claimId}/decision`, {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", decision },
    });
    toast.add({ title: `申请已${action}`, color: "success" });
    conflictTarget.value = null;
    rejectTarget.value = null;
    detailTarget.value = null;
    // A-04 — update the row in place instead of reloading the whole page.
    const updated = claims.value.find((candidate) => candidate.claimId === claim.claimId);
    if (updated) {
      updated.status = decision === "approved" ? "approved" : "rejected";
      flashRow(updated.claimId, updatedClaimIds);
    }
  } catch (error) {
    toast.add({ title: "无法处理申请", description: portalErrorDetails(error).description, color: "error" });
  } finally {
    deciding.value = false;
  }
}

function openRevoke(invitation: AdminBindingInvitation) {
  revokeTarget.value = invitation;
  revokeReason.value = "";
}
function closeRevoke() {
  if (revoking.value) return;
  revokeTarget.value = null;
  revokeReason.value = "";
}
async function revokeInvitation() {
  const target = revokeTarget.value;
  if (!target) return;
  revoking.value = true;
  try {
    const reason = revokeReason.value.trim();
    await api(`/v1/binding-invites/${target.inviteId}/revoke`, {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", ...(reason ? { reason } : {}) },
    });
    revokeTarget.value = null;
    revokeReason.value = "";
    toast.add({ title: "邀请码已撤销", color: "success" });
    // A-04 — update the row in place instead of reloading the whole page.
    const updated = invitations.value.find((candidate) => candidate.inviteId === target.inviteId);
    if (updated) {
      updated.status = "revoked";
      flashRow(updated.inviteId, updatedInviteIds);
    }
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
async function revealCode(invitation: AdminBindingInvitation) {
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

async function retryHistoricalMigration(invitation: AdminBindingInvitation) {
  try {
    await api(`/v1/binding-invites/${invitation.inviteId}/historical-migration/retry`, { method: "POST", headers: { "Idempotency-Key": createRequestId() } });
    toast.add({ title: "已提交历史称号重试", color: "success" });
    await load();
  } catch (error) {
    toast.add({ title: "无法重试历史称号迁移", description: portalErrorDetails(error).description, color: "error" });
  }
}

onMounted(load);
</script>

<template>
  <AdminWorkspace title="绑定例外与邀请" :count="workspaceCount">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section class="binding-section" aria-label="绑定例外与邀请">
      <UTabs v-model="activeTab" :items="bindingTabs" variant="link" aria-label="绑定管理类型" class="binding-tabs">
        <template #claims>
          <AdminDataTable v-model:sorting="claimSorting" :data="visibleClaims" :columns="columns" :mobile-columns="[{ id: 'playerName', priority: 'primary', order: 0 }, { id: 'status', priority: 'primary', order: 1 }, { id: 'operationType', priority: 'detail', order: 2 }, { id: 'createdAt', priority: 'detail', order: 3 }]" :loading="loading" :sorting-options="claimSortingOptions" :default-sorting="defaultClaimSorting" empty="暂无待处理例外。" row-key="claimId" table-key="binding-claims">
            <template #filters><USelect v-model="claimStatus" aria-label="筛选申请状态" :items="[{ label: '待处理例外', value: 'pending_review' }, { label: '全部申请', value: 'all' }]" /></template>
            <template #mobile-primary><USelect v-model="claimStatus" class="w-full" aria-label="筛选申请状态" :items="[{ label: '待处理例外', value: 'pending_review' }, { label: '全部申请', value: 'all' }]" /></template>
            <template #playerName-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
            <template #operationType-cell="{ row }"><StatusBadge :label="operationTypeLabel(row.original.operationType)" :tone="operationTypeTone(row.original.operationType)" /></template>
            <template #status-cell="{ row }"><StatusBadge :class="updatedClaimIds.has(row.original.claimId) ? 'row-update-flash' : undefined" :label="statusLabel(row.original.status)" :tone="row.original.status === 'pending_review' ? 'warning' : row.original.status === 'approved' ? 'success' : 'default'" /></template>
            <template #createdAt-cell="{ row }"><span class="table-meta">{{ formatDate(row.original.createdAt) }}</span></template>
            <template #actions-cell="{ row }">
              <div class="claim-actions">
                <UButton label="详情" color="neutral" variant="outline" size="sm" @click="detailTarget = row.original" />
                <template v-if="row.original.status === 'pending_review'">
                  <UButton label="批准" size="sm" :disabled="deciding" @click="handleApprove(row.original)" />
                  <UButton label="拒绝" color="error" variant="soft" size="sm" :disabled="deciding" @click="handleReject(row.original)" />
                </template>
              </div>
            </template>
          </AdminDataTable>
        </template>
        <template #invitations>
          <AdminDataTable v-model:sorting="invitationSorting" :data="invitations" :columns="invitationColumns" :mobile-columns="[{ id: 'playerName', priority: 'primary', order: 0 }, { id: 'status', priority: 'primary', order: 1 }, { id: 'historicalMigration', priority: 'detail', order: 2 }, { id: 'expiresAt', priority: 'detail', order: 3 }]" :loading="loading" :sorting-options="invitationSortingOptions" :default-sorting="defaultInvitationSorting" empty="暂无邀请码。" row-key="inviteId" table-key="binding-invites">
            <template #playerName-cell="{ row }"><strong><PlayerBattleTag :player-name="row.original.playerName" :player-id="row.original.playerId" /></strong></template>
            <template #status-cell="{ row }"><StatusBadge :class="updatedInviteIds.has(row.original.inviteId) ? 'row-update-flash' : undefined" :label="invitationStatusLabel(row.original.status)" :tone="row.original.status === 'active' ? 'warning' : row.original.status === 'redeemed' ? 'success' : 'default'" /></template>
            <template #historicalMigration-cell="{ row }"><StatusBadge :label="historicalMigrationLabel(row.original.historicalMigration)" :tone="historicalMigrationTone(row.original.historicalMigration)" /></template>
            <template #expiresAt-cell="{ row }"><span class="table-meta">{{ formatDate(row.original.expiresAt) }}</span></template>
            <template #actions-cell="{ row }"><div v-if="row.original.status === 'active'" class="table-actions invite-actions"><UButton v-if="row.original.codeAvailable" label="查看" color="neutral" variant="outline" size="sm" @click="revealCode(row.original)" /><span v-else class="table-meta">需重新生成</span><UButton label="撤销" color="error" variant="soft" size="sm" @click="openRevoke(row.original)" /></div><UButton v-if="row.original.historicalMigration.status === 'retry_required'" label="重试迁移" color="warning" variant="soft" size="sm" @click="retryHistoricalMigration(row.original)" /></template>
          </AdminDataTable>
        </template>
        <template #create>
          <BindingInvitePanel @created="load" />
        </template>
        <template #batch>
          <BindingInviteBatchPanel @created="load" />
        </template>
      </UTabs>
    </section>

    <AdminResponsiveDialog :open="detailTarget !== null" title="绑定申请详情" :description="detailTarget ? `${detailTarget.playerName}#${detailTarget.playerId}` : undefined" size="md" @update:open="(open) => { if (!open) detailTarget = null; }">
      <template #body>
        <div v-if="detailTarget" class="claim-detail">
          <dl class="detail-grid">
            <div class="detail-grid__row"><dt>操作类型</dt><dd><StatusBadge :label="operationTypeLabel(detailTarget.operationType)" :tone="operationTypeTone(detailTarget.operationType)" /></dd></div>
            <div class="detail-grid__row"><dt>目标战网账号当前绑定</dt><dd>{{ detailTarget.targetAccountBinding ? detailTarget.targetAccountBinding.memberOpenId : "无" }}</dd></div>
            <div class="detail-grid__row">
              <dt>该 QQ 当前绑定的战网账号</dt>
              <dd>
                <template v-if="detailTarget.qqBoundAccounts && detailTarget.qqBoundAccounts.length > 0">
                  <span v-for="acc in detailTarget.qqBoundAccounts" :key="acc.playerAccountId" class="qq-bound-item">{{ acc.playerName }}#{{ acc.playerId }}</span>
                </template>
                <template v-else>无</template>
              </dd>
            </div>
            <div class="detail-grid__row"><dt>将解除的绑定</dt><dd>{{ detailTarget.revokingBindingCount ?? 0 }} 个</dd></div>
            <div class="detail-grid__row"><dt>申请状态</dt><dd><StatusBadge :label="statusLabel(detailTarget.status)" :tone="detailTarget.status === 'pending_review' ? 'warning' : detailTarget.status === 'approved' ? 'success' : 'default'" /></dd></div>
          </dl>
        </div>
      </template>
      <template #footer>
        <template v-if="detailTarget && detailTarget.status === 'pending_review'">
          <UButton label="批准" :disabled="deciding" @click="handleApprove(detailTarget)" />
          <UButton label="拒绝" color="error" variant="soft" :disabled="deciding" @click="handleReject(detailTarget)" />
        </template>
        <UButton label="关闭" color="neutral" variant="outline" @click="detailTarget = null" />
      </template>
    </AdminResponsiveDialog>

    <AdminResponsiveDialog :open="conflictTarget !== null" title="确认批准冲突申请" :description="conflictTarget ? `${conflictTarget.playerName}#${conflictTarget.playerId}` : undefined" size="md" :dismissible="!deciding" @update:open="(open) => { if (!open && !deciding) conflictTarget = null; }">
      <template #body>
        <div v-if="conflictTarget" class="claim-detail">
          <UAlert color="warning" variant="subtle" title="身份冲突提示" description="批准此操作将解除现有关联绑定，并退出相关登录。" />
          <dl class="detail-grid">
            <div class="detail-grid__row"><dt>操作类型</dt><dd><StatusBadge :label="operationTypeLabel(conflictTarget.operationType)" :tone="operationTypeTone(conflictTarget.operationType)" /></dd></div>
            <div class="detail-grid__row"><dt>目标战网账号当前绑定</dt><dd>{{ conflictTarget.targetAccountBinding ? conflictTarget.targetAccountBinding.memberOpenId : "无" }}</dd></div>
            <div class="detail-grid__row">
              <dt>该 QQ 当前绑定的战网账号</dt>
              <dd>
                <template v-if="conflictTarget.qqBoundAccounts && conflictTarget.qqBoundAccounts.length > 0">
                  <span v-for="acc in conflictTarget.qqBoundAccounts" :key="acc.playerAccountId" class="qq-bound-item">{{ acc.playerName }}#{{ acc.playerId }}</span>
                </template>
                <template v-else>无</template>
              </dd>
            </div>
            <div class="detail-grid__row"><dt>将解除的绑定</dt><dd>{{ conflictTarget.revokingBindingCount ?? 0 }} 个</dd></div>
          </dl>
        </div>
      </template>
      <template #footer>
        <UButton label="确认批准" color="error" variant="soft" :loading="deciding" @click="decide(conflictTarget!, 'approved')" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="deciding" @click="conflictTarget = null" />
      </template>
    </AdminResponsiveDialog>

    <AdminResponsiveDialog :open="rejectTarget !== null" title="确认拒绝申请" :description="rejectTarget ? `${rejectTarget.playerName}#${rejectTarget.playerId}` : undefined" size="sm" :dismissible="!deciding" @update:open="(open) => { if (!open && !deciding) rejectTarget = null; }">
      <template #body><p class="revoke-note">拒绝后该申请关闭，玩家需要重新发起绑定。</p></template>
      <template #footer><UButton label="确认拒绝" color="error" variant="soft" :loading="deciding" @click="decide(rejectTarget!, 'rejected')" /><UButton label="取消" color="neutral" variant="outline" :disabled="deciding" @click="rejectTarget = null" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog :open="revokeTarget !== null" title="撤销邀请码" :description="revokeTarget ? `${revokeTarget.playerName}#${revokeTarget.playerId}` : undefined" size="sm" :dismissible="!revoking" @update:open="(open) => { if (!open) closeRevoke(); }">
      <template #body><form v-if="revokeTarget" id="invite-revoke" class="revoke-form" @submit.prevent="revokeInvitation"><p class="revoke-note">撤销后无法恢复。</p><UFormField label="撤销原因"><UTextarea v-model="revokeReason" maxlength="256" placeholder="例如：发送对象有误" :disabled="revoking" /></UFormField></form></template>
      <template #footer><UButton label="确认撤销" color="error" variant="soft" type="submit" form="invite-revoke" :loading="revoking" /><UButton label="取消" color="neutral" variant="outline" :disabled="revoking" @click="closeRevoke" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog :open="codeTarget !== null" title="邀请码" :description="codeTarget ? `${codeTarget.playerName}#${codeTarget.playerId}` : undefined" size="sm" :dismissible="!revealingCode" @update:open="(open) => { if (!open) closeCode(); }">
      <template #body><div class="invite-code"><span v-if="revealingCode" class="table-meta">读取中…</span><code v-else>{{ invitationCode }}</code></div></template>
      <template #footer><UButton label="复制口令" :disabled="!invitationCode" @click="copyInvitationCode" /><UButton label="关闭" color="neutral" variant="outline" :disabled="revealingCode" @click="closeCode" /></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.binding-section, .binding-tabs { display: grid; gap: var(--space-3); }
.claim-actions, .invite-actions { display: flex; gap: var(--space-2); }
.table-meta, .revoke-note { color: var(--quiet); font-size: var(--type-caption-size); }
.revoke-form { display: grid; gap: var(--space-4); }
.invite-code { display: grid; min-height: 56px; place-items: center; border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface-raised); }
.invite-code code { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--type-card-title-size); font-weight: 700; letter-spacing: .12em; }
.claim-detail { display: grid; gap: var(--space-3); }
.qq-bound-item { display: inline-block; }
</style>
