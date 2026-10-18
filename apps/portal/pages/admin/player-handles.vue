<script setup lang='ts'>
import type { TableColumn } from '@nuxt/ui';
import type { AdminPlayerHandle, AdminPlayerHandleListResponse } from '@owbastion/contracts';
import { createRequestId } from '~/utils/request-id';
import { portalErrorDetails } from '~/utils/portal-error';

definePageMeta({ middleware: ['auth', 'admin-client'] });
useSeoMeta({ title: '玩家 ID · 躲避堡垒 3' });

const api = useAdminApi();
const status = ref<AdminPlayerHandleListResponse['status']>('pending');
const page = ref(1);
const pageSize = 25;
const items = ref<AdminPlayerHandle[]>([]);
const total = ref(0);
const errorMessage = ref('');
const feedback = ref('');
const busyId = ref('');

const columns: TableColumn<AdminPlayerHandle>[] = [
  { accessorKey: 'handle', header: 'ID' },
  { accessorKey: 'playerName', header: '玩家' },
  { id: 'currentHandle', header: '当前 ID' },
  { accessorKey: 'requestedAt', header: '时间' },
  { id: 'actions', header: '', enableHiding: false },
];

const adminData = useAdminAsyncData('player-handles', async () => {
  const response = await api<AdminPlayerHandleListResponse>(`/v1/player-handles?status=${status.value}&page=${page.value}&pageSize=${pageSize}`);
  if (page.value > 1 && !response.items.length && response.total) page.value -= 1;
  return response;
}, {
  cacheKey: computed(() => `${status.value}:${page.value}`),
  onStart: () => { errorMessage.value = ''; },
  onData: (response) => { items.value = response.items; total.value = response.total; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, '无法读取玩家 ID，请确认当前账号有管理员权限。').description; },
});
const loading = adminData.loading;

async function run(row: AdminPlayerHandle, request: { path: string; method: 'POST' | 'DELETE' }, done: string) {
  if (busyId.value) return;
  busyId.value = row.handleId;
  errorMessage.value = '';
  feedback.value = '';
  try {
    await api(request.path, { method: request.method, headers: { 'Idempotency-Key': createRequestId() } });
    feedback.value = done;
    await adminData.refresh();
  } catch (error) { errorMessage.value = portalErrorDetails(error, '操作未完成，请稍后重试。').description; }
  finally { busyId.value = ''; }
}
const approve = (row: AdminPlayerHandle) => run(row, { path: `/v1/player-handles/${encodeURIComponent(row.handleId)}/approve`, method: 'POST' }, `已通过「${row.handle}」。`);
const reject = (row: AdminPlayerHandle) => run(row, { path: `/v1/player-handles/${encodeURIComponent(row.handleId)}/reject`, method: 'POST' }, `已拒绝「${row.handle}」。`);
const clear = (row: AdminPlayerHandle) => run(row, { path: `/v1/player-accounts/${encodeURIComponent(row.playerAccountId)}/handle`, method: 'DELETE' }, `已清除「${row.handle}」。`);

watch(status, () => { page.value = 1; }, { flush: 'sync' });
</script>

<template>
  <AdminWorkspace title='玩家 ID' :count='loading ? "读取中…" : total + " 条"'>
    <template #actions><UButton label='刷新' icon='i-lucide-refresh-cw' color='neutral' variant='outline' :loading='loading' @click='() => adminData.refresh()' /></template>
    <template #messages>
      <UAlert v-if='errorMessage' color='error' variant='subtle' :description='errorMessage' />
      <UAlert v-if='feedback' color='success' variant='subtle' :description='feedback' />
    </template>
    <section aria-label='玩家 ID 记录'>
      <AdminDataTable :data='items' :columns='columns' :mobile-columns='[{ id: "handle", priority: "primary", order: 0 }, { id: "playerName", priority: "primary", order: 1 }, { id: "currentHandle", priority: "detail", order: 2 }, { id: "requestedAt", priority: "detail", order: 3 }]' row-key='handleId' :loading='loading' :empty='status === "pending" ? "暂无待审核的 ID。" : "暂无已启用的 ID。"' table-key='player-handles' manual-filtering :reset-scroll-key='`${page}-${status}`'>
        <template #filters><USelect v-model='status' aria-label='筛选状态' :items='[{ label: "待审核", value: "pending" }, { label: "已启用", value: "active" }]' /></template>
        <template #mobile-primary><USelect v-model='status' class='w-full' aria-label='筛选状态' :items='[{ label: "待审核", value: "pending" }, { label: "已启用", value: "active" }]' /></template>
        <template #handle-cell='{ row }'><strong>{{ row.original.handle }}</strong></template>
        <template #currentHandle-cell='{ row }'><span class='table-meta'>{{ row.original.currentHandle ?? '—' }}</span></template>
        <template #requestedAt-cell='{ row }'><span class='table-meta'>{{ formatTime(row.original.requestedAt) }}</span></template>
        <template #actions-cell='{ row }'>
          <div class='table-actions'>
            <template v-if='status === "pending"'>
              <UButton label='通过' size='sm' :loading='busyId === row.original.handleId' :disabled='!!busyId' @click='approve(row.original)' />
              <UButton label='拒绝' size='sm' color='neutral' variant='outline' :disabled='!!busyId' @click='reject(row.original)' />
            </template>
            <UButton v-else label='清除' size='sm' color='error' variant='soft' :loading='busyId === row.original.handleId' :disabled='!!busyId' @click='clear(row.original)' />
          </div>
        </template>
      </AdminDataTable>
      <UPagination v-if='total > pageSize' v-model:page='page' :total='total' :items-per-page='pageSize' class='pagination' />
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { display: block; color: var(--quiet); font-size: var(--type-caption-size); }
</style>
