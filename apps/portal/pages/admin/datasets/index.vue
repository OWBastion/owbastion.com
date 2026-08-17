<script setup lang='ts'>
import type { TableColumn } from '@nuxt/ui';
import type { AdminDatasetDetail, AdminDatasetSnapshot } from '~/composables/useAdminApi';
import { createRequestId } from '~/utils/request-id';
import { portalErrorDetails } from '~/utils/portal-error';

definePageMeta({ middleware: ['auth', 'admin-client'] });
useSeoMeta({ title: '数据集 · 躲避堡垒 3' });

const api = useAdminApi();
const datasets = ref<AdminDatasetSnapshot[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const feedback = ref('');
const page = ref(1);
const total = ref(0);
const statusFilter = ref<'all' | AdminDatasetSnapshot['status']>('all');
const creating = ref(false);
const selectedDetail = ref<AdminDatasetDetail | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const finalizing = ref(false);

const formatTime = (value: number) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
const statusLabel = (status: string) => status === 'draft' ? '草稿' : '已定稿';
const exclusionReasonLabel = (reason: string) => ({ already_snapshotted: '已在其他快照中', missing_model_version: '缺少模型版本', missing_layout_version: '缺少布局版本', missing_evidence: '缺少源证据' })[reason] ?? reason;

const columns: TableColumn<AdminDatasetSnapshot>[] = [
  { id: 'version', accessorKey: 'version', header: '版本' },
  { accessorKey: 'status', header: '状态' },
  { id: 'counts', accessorFn: (row) => `${row.counts.eligibleCount}/${row.counts.excludedCount}`, header: '入选/排除' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '', enableHiding: false },
];

const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: '20' });
  if (statusFilter.value !== 'all') params.set('status', statusFilter.value);
  return params.toString();
});

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await api<{ items: AdminDatasetSnapshot[]; total: number }>('/v1/datasets?' + query.value);
    datasets.value = response.items;
    total.value = response.total;
    if (page.value > 1 && !response.items.length && response.total) { page.value -= 1; await load(); }
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, '无法读取数据集，请确认当前账号有管理员权限。').description;
  } finally { loading.value = false; }
}

async function createDraft() {
  if (creating.value) return;
  creating.value = true;
  errorMessage.value = '';
  feedback.value = '';
  try {
    const response = await api<AdminDatasetDetail['snapshot']>('/v1/datasets', {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId() },
      body: { contractVersion: '1' },
    });
    feedback.value = `已创建 v${response.version} 草稿，入选 ${response.counts.eligibleCount} 条、排除 ${response.counts.excludedCount} 条。`;
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, '无法创建数据集草稿。').description;
  } finally { creating.value = false; }
}

async function openDetail(datasetId: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  selectedDetail.value = null;
  try { selectedDetail.value = await api<AdminDatasetDetail>('/v1/datasets/' + encodeURIComponent(datasetId)); }
  catch (error) { detailError.value = portalErrorDetails(error, '无法读取数据集详情。').description; }
  finally { detailLoading.value = false; }
}

async function finalize() {
  if (!selectedDetail.value || finalizing.value) return;
  finalizing.value = true;
  detailError.value = '';
  try {
    const response = await api<{ status: 'finalized'; version: number }>(`/v1/datasets/${encodeURIComponent(selectedDetail.value.snapshot.datasetId)}/finalize`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId() },
      body: { contractVersion: '1' },
    });
    feedback.value = `v${response.version} 已定稿，快照不可再变更。`;
    detailOpen.value = false;
    await load();
  } catch (error) { detailError.value = portalErrorDetails(error, '定稿未完成，请稍后重试。').description; }
  finally { finalizing.value = false; }
}

watch(statusFilter, () => { page.value = 1; void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title='数据集' :count='loading ? "读取中…" : total + " 个"'>
    <template #actions>
      <UButton label='创建草稿' icon='i-lucide-database-plus' color='primary' :loading='creating' @click='createDraft' />
      <UButton label='刷新' icon='i-lucide-refresh-cw' color='neutral' variant='outline' :loading='loading' @click='load' />
    </template>
    <template #messages>
      <UAlert v-if='errorMessage' color='error' variant='subtle' :description='errorMessage' />
      <UAlert v-if='feedback' color='success' variant='subtle' :description='feedback' />
    </template>

    <section aria-label='数据集列表'>
      <AdminDataTable :data='datasets' :columns='columns' :mobile-columns='[{ id: "version", priority: "primary", order: 0 }, { id: "status", priority: "primary", order: 1 }, { id: "counts", priority: "detail", order: 2 }, { id: "createdAt", priority: "detail", order: 3 }]' row-key='datasetId' :loading='loading' empty='暂无数据集。' table-key='admin-datasets' manual-filtering :reset-scroll-key='`${page}-${statusFilter}`'>
        <template #filters><div class='dataset-filters'>
          <USelect v-model='statusFilter' aria-label='筛选状态' :items='[{ label: "全部状态", value: "all" }, { label: "草稿", value: "draft" }, { label: "已定稿", value: "finalized" }]' />
        </div></template>
        <template #mobile-primary><USelect v-model='statusFilter' class='w-full' aria-label='筛选状态' :items='[{ label: "全部状态", value: "all" }, { label: "草稿", value: "draft" }, { label: "已定稿", value: "finalized" }]' /></template>
        <template #status-cell='{ row }'><StatusBadge :label='statusLabel(row.original.status)' :tone='row.original.status === "finalized" ? "success" : "default"' /></template>
        <template #counts-cell='{ row }'><span>{{ row.original.counts.eligibleCount }} 条入选</span><span class='table-meta'>排除 {{ row.original.counts.excludedCount }} · {{ row.original.counts.submissionCount }} 份截图 · {{ row.original.counts.annotationCount }} 条标注</span></template>
        <template #createdAt-cell='{ row }'><span>{{ formatTime(row.original.createdAt) }}</span><span class='table-meta'>{{ row.original.createdBy }}</span></template>
        <template #actions-cell='{ row }'><div class='table-actions'><UButton label='详情' size='sm' color='neutral' variant='outline' @click='openDetail(row.original.datasetId)' /></div></template>
      </AdminDataTable>
      <UPagination v-if='total > 20' v-model:page='page' :total='total' :items-per-page='20' class='pagination' @update:page='load' />
    </section>

    <AdminResponsiveDialog v-model:open='detailOpen' title='数据集详情' description='已定稿快照的成员与来源不可再变更。' size='lg'>
      <template #body>
        <UAlert v-if='detailError' color='error' variant='subtle' :description='detailError' class='dataset-dialog-error' />
        <p v-if='detailLoading' class='dataset-dialog-message' role='status'>读取详情…</p>
        <template v-else-if='selectedDetail'>
          <dl class='dataset-facts'>
            <div><dt>版本</dt><dd>v{{ selectedDetail.snapshot.version }}</dd></div>
            <div><dt>状态</dt><dd><StatusBadge :label='statusLabel(selectedDetail.snapshot.status)' :tone='selectedDetail.snapshot.status === "finalized" ? "success" : "default"' /></dd></div>
            <div><dt>创建时间</dt><dd>{{ formatTime(selectedDetail.snapshot.createdAt) }}</dd></div>
            <div><dt>定稿时间</dt><dd>{{ selectedDetail.snapshot.finalizedAt ? formatTime(selectedDetail.snapshot.finalizedAt) : "—" }}</dd></div>
            <div><dt>入选 / 排除</dt><dd>{{ selectedDetail.snapshot.counts.eligibleCount }} / {{ selectedDetail.snapshot.counts.excludedCount }}</dd></div>
            <div><dt>来源截图</dt><dd>{{ selectedDetail.snapshot.counts.submissionCount }}</dd></div>
          </dl>
          <div v-if='selectedDetail.members.length' class='dataset-members'>
            <h3>成员标注（{{ selectedDetail.members.length }}）</h3>
            <ul>
              <li v-for='member in selectedDetail.members' :key='member.annotationId'>
                <div><strong>{{ member.fieldKey }}</strong><span class='table-meta'>{{ member.modelVersion }} / {{ member.layoutVersion }}</span></div>
                <div class='dataset-mono'>审定：{{ member.reviewedValue }}<span v-if='member.normalizedValue'> · 规范化：{{ member.normalizedValue }}</span><span v-if='member.originalOcrValue'> · 原始：{{ member.originalOcrValue }}</span></div>
                <div class='table-meta'>证据{{ member.evidence.available ? "可用" : "缺失" }}</div>
              </li>
            </ul>
          </div>
          <div v-if='selectedDetail.exclusions.length' class='dataset-exclusions'>
            <h3>排除记录（{{ selectedDetail.exclusions.length }}）</h3>
            <ul>
              <li v-for='exclusion in selectedDetail.exclusions' :key='exclusion.annotationId'>
                <span>{{ exclusion.annotationId }}</span><span class='table-meta'>{{ exclusionReasonLabel(exclusion.reason) }}</span>
              </li>
            </ul>
          </div>
        </template>
      </template>
      <template v-if='selectedDetail?.snapshot.status === "draft"' #footer>
        <UButton label='定稿冻结' color='primary' :loading='finalizing' :disabled='finalizing' @click='finalize' />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.dataset-filters { display: grid; grid-template-columns: minmax(140px, 220px); }
.dataset-dialog-error { margin-bottom: 12px; }
.dataset-dialog-message { margin: 0; padding: 40px 0; color: var(--muted); text-align: center; }
.dataset-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 18px; }
.dataset-facts > div { display: grid; gap: 4px; min-width: 0; }
.dataset-facts dt { color: var(--quiet); font-size: .74rem; }
.dataset-facts dd { margin: 0; color: var(--text); font-size: .86rem; }
.dataset-members h3, .dataset-exclusions h3 { margin: 0 0 10px; font-size: .9rem; font-weight: 680; }
.dataset-members ul, .dataset-exclusions ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.dataset-members li, .dataset-exclusions li {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.dataset-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; overflow-wrap: anywhere; }
.pagination { display: flex; justify-content: center; margin-top: 10px; }
@media (max-width: 560px) {
  .dataset-facts { grid-template-columns: minmax(0, 1fr); }
}
</style>
