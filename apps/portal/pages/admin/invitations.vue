<script setup lang="ts">
import type { TabsItem } from "@nuxt/ui";
import type { AdminInvitationOverviewResponse, AdminPlayerInvitationAuditResponse } from "@owbastion/contracts/player-invitation";
import { formatTime } from "~/utils/date-time";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "邀请 · 躲避堡垒 3" });

type Item = AdminInvitationOverviewResponse["items"][number];

const api = useAdminApi();
const tab = shallowRef("codes");
const tabs = [{ label: "邀请码", value: "codes", slot: "codes" as const }, { label: "策略", value: "policy", slot: "policy" as const }, { label: "记录", value: "audit", slot: "audit" as const }] satisfies TabsItem[];
const type = shallowRef<"all" | "admin" | "player">("all");
const status = shallowRef("all");
const issuer = shallowRef("");
const page = shallowRef(1);
const auditPage = shallowRef(1);
const pageSize = 20;
const items = shallowRef<Item[]>([]);
const total = shallowRef(0);
const audit = shallowRef<AdminPlayerInvitationAuditResponse | null>(null);
const errorMessage = shallowRef("");
const feedback = shallowRef("");
const busyId = shallowRef("");
const overrideTarget = shallowRef<string | undefined>();

const typeItems = [{ label: "全部类型", value: "all" }, { label: "管理员邀请", value: "admin" }, { label: "玩家邀请", value: "player" }];
const statusLabels: Record<Item["status"], string> = { active: "可用", redeemed: "已确认", exhausted: "已用完", expired: "已过期", revoked: "已撤销", inviter_blocked: "邀请人已停用" };
const statusItems = [{ label: "全部状态", value: "all" }, ...Object.entries(statusLabels).map(([value, label]) => ({ label, value }))];
const columns = [
  { accessorKey: "issuer", header: "发起人" },
  { accessorKey: "type", header: "类型" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "usedCount", header: "使用" },
  { accessorKey: "expiresAt", header: "有效期" },
  { id: "actions", header: "", enableHiding: false },
];

const query = () => new URLSearchParams({ type: type.value, ...(status.value !== "all" ? { status: status.value } : {}), ...(issuer.value.trim() ? { issuer: issuer.value.trim() } : {}), page: String(page.value), pageSize: String(pageSize) }).toString();
const adminData = useAdminAsyncData("invitations", async () => {
  const [overview, trail] = await Promise.all([
    api<AdminInvitationOverviewResponse>(`/v1/invitations?${query()}`),
    api<AdminPlayerInvitationAuditResponse>(`/v1/player-invitations/audit?page=${auditPage.value}&pageSize=20`),
  ]);
  return { overview, trail };
}, {
  cacheKey: computed(() => `${query()}:${auditPage.value}`),
  onStart: () => { errorMessage.value = ""; },
  onData: ({ overview, trail }) => { items.value = overview.items; total.value = overview.total; audit.value = trail; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取邀请记录。").description; },
});
const loading = adminData.loading;

async function revoke(item: Item) {
  if (busyId.value) return;
  busyId.value = item.invitationId;
  errorMessage.value = "";
  feedback.value = "";
  try {
    await api(`/v1/player-invitations/${item.invitationId}/revoke`, { method: "POST", headers: { "Idempotency-Key": createRequestId() } });
    feedback.value = "已撤销邀请码。";
    await adminData.refresh();
  } catch (error) { errorMessage.value = portalErrorDetails(error, "操作未完成，请稍后重试。").description; }
  finally { busyId.value = ""; }
}

function setOverride(item: Item) {
  overrideTarget.value = item.inviterPlayerAccountId ?? undefined;
  tab.value = "policy";
}

watch([type, status, issuer], () => { page.value = 1; }, { flush: "sync" });
</script>

<template>
  <AdminWorkspace title="邀请" :count="loading ? '读取中…' : `${total} 条`">
    <template #actions><UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="loading" @click="() => adminData.refresh()" /></template>
    <template #messages>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
      <UAlert v-if="feedback" color="success" variant="subtle" :description="feedback" />
    </template>
    <UTabs v-model="tab" :items="tabs" variant="link" aria-label="邀请管理">
      <template #codes>
        <AdminDataTable :data="items" :columns="columns" :mobile-columns="[{ id: 'issuer', priority: 'primary', order: 0 }, { id: 'status', priority: 'primary', order: 1 }, { id: 'usedCount', priority: 'detail', order: 2 }, { id: 'expiresAt', priority: 'detail', order: 3 }]" row-key="invitationId" :loading="loading" empty="暂无邀请码。" table-key="invitations" manual-filtering :reset-scroll-key="`${page}-${type}-${status}`">
          <template #filters>
            <USelect v-model="type" aria-label="筛选类型" :items="typeItems" />
            <USelect v-model="status" aria-label="筛选状态" :items="statusItems" />
            <UInput v-model.lazy="issuer" aria-label="按发起人筛选" placeholder="发起人" />
          </template>
          <template #mobile-primary>
            <USelect v-model="type" class="w-full" aria-label="筛选类型" :items="typeItems" />
            <USelect v-model="status" class="w-full" aria-label="筛选状态" :items="statusItems" />
          </template>
          <template #type-cell="{ row }">{{ row.original.type === 'admin' ? '管理员' : '玩家' }}</template>
          <template #status-cell="{ row }">{{ statusLabels[row.original.status] }}</template>
          <template #usedCount-cell="{ row }"><span class="num">{{ row.original.usedCount }}/{{ row.original.maxUses }}</span></template>
          <template #expiresAt-cell="{ row }"><span class="meta">{{ formatTime(row.original.expiresAt) }}</span></template>
          <template #actions-cell="{ row }">
            <div v-if="row.original.type === 'player'" class="actions">
              <UButton v-if="row.original.status === 'active'" label="撤销" size="sm" color="error" variant="soft" :loading="busyId === row.original.invitationId" :disabled="!!busyId" @click="revoke(row.original)" />
              <UButton v-if="row.original.inviterPlayerAccountId" label="个人额度" size="sm" color="neutral" variant="outline" @click="setOverride(row.original)" />
            </div>
          </template>
        </AdminDataTable>
        <UPagination v-if="total > pageSize" v-model:page="page" :total="total" :items-per-page="pageSize" class="pagination" />
      </template>
      <template #policy><AdminInvitationPolicy :player-account-id="overrideTarget" @saved="() => adminData.refresh()" /></template>
      <template #audit>
        <p v-if="!audit?.items.length" class="meta">暂无记录。</p>
        <ul v-else class="audit">
          <li v-for="entry in audit.items" :key="entry.auditId"><strong>{{ entry.operation }}</strong> <span class="meta">{{ formatTime(entry.createdAt) }}</span></li>
        </ul>
        <UPagination v-if="audit && audit.total > audit.pageSize" v-model:page="auditPage" :total="audit.total" :items-per-page="audit.pageSize" class="pagination" />
      </template>
    </UTabs>
  </AdminWorkspace>
</template>

<style scoped>
.meta { color: var(--quiet); font-size: var(--type-caption-size); }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.audit { display: grid; gap: var(--space-2); margin: var(--space-4) 0 0; padding: 0; list-style: none; }
</style>
