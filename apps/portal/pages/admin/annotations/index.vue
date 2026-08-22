<script setup lang='ts'>
import type { TableColumn } from '@nuxt/ui';
import type { AdminAnnotationProposal, AdminAnnotationProposalDetail, AdminReviewedAnnotation } from '~/composables/useAdminApi';
import { annotationFieldItems, annotationFieldLabel } from '~/utils/annotation-labels';
import { createRequestId } from '~/utils/request-id';
import { portalErrorDetails } from '~/utils/portal-error';

definePageMeta({ middleware: ['auth', 'admin-client'] });
useSeoMeta({ title: '标注 · 躲避堡垒 3' });

const api = useAdminApi();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const activeTab = ref<'proposals' | 'reviewed'>('proposals');
const proposals = ref<AdminAnnotationProposal[]>([]);
const reviewed = ref<AdminReviewedAnnotation[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const page = ref(1);
const total = ref(0);
const proposalState = ref<'all' | AdminAnnotationProposal['reviewState']>('pending');
const fieldKey = ref<'all' | AdminAnnotationProposal['fieldKey']>('all');
const kind = ref<'all' | 'correction' | 'confirmation'>('all');
const promptOrigin = ref<'all' | string>('all');
const reviewedState = ref<'all' | AdminReviewedAnnotation['reviewState']>('all');
const selectedDetail = ref<AdminAnnotationProposalDetail | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const editing = ref(false);
const editValue = ref('');
const saving = ref(false);
const directOpen = ref(false);
const directSubmissionId = ref('');
const fieldFilterItems = [{ label: '全部字段', value: 'all' }, ...annotationFieldItems];

const formatTime = (value: number) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
const fieldLabel = annotationFieldLabel;
const feedbackTypeLabel = (type: string) => type === 'confirmed' ? '确认' : type === 'corrected' ? '修正' : '被动报告';
const originLabel = (origin: string | null) => origin ? ({ uncertainty: '不确定', conflict: '冲突', grouped: '分组核对', calibration: '校准抽查', passive: '被动报告' })[origin] ?? origin : '—';
const priorityLabel = (category: string) => ({ correction: '玩家修正', calibration_failure: '校准失败', uncertain: '不确定字段', repeat: '重复模式', confirmation: '例行确认' })[category] ?? category;
const stateLabel = (state: string) => ({ pending: '待审', accepted: '已接受', rejected: '已拒绝', superseded: '已取代' })[state] ?? state;

const columns: TableColumn<AdminAnnotationProposal>[] = [
  { id: 'field', accessorKey: 'fieldKey', header: '字段' },
  { accessorKey: 'submissionMapName', header: '提交' },
  { accessorKey: 'feedbackType', header: '反馈' },
  { id: 'proposed', accessorKey: 'proposedValue', header: '建议值' },
  { accessorKey: 'reviewState', header: '状态' },
  { accessorKey: 'playerSubmittedAt', header: '提交时间' },
  { id: 'actions', header: '', enableHiding: false },
];

const reviewedColumns: TableColumn<AdminReviewedAnnotation>[] = [
  { id: 'field', accessorKey: 'fieldKey', header: '字段' },
  { accessorKey: 'submissionMapName', header: '提交' },
  { accessorKey: 'reviewedValue', header: '审定值' },
  { id: 'normalized', accessorKey: 'normalizedValue', header: '规范化值' },
  { accessorKey: 'reviewState', header: '状态' },
  { accessorKey: 'reviewedAt', header: '审定时间' },
];

const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: '20' });
  if (activeTab.value === 'proposals') {
    if (proposalState.value !== 'all') params.set('state', proposalState.value);
    if (fieldKey.value !== 'all') params.set('fieldKey', fieldKey.value);
    if (kind.value !== 'all') params.set('kind', kind.value);
    if (promptOrigin.value !== 'all') params.set('promptOrigin', promptOrigin.value);
  } else {
    if (reviewedState.value !== 'all') params.set('state', reviewedState.value);
    if (fieldKey.value !== 'all') params.set('fieldKey', fieldKey.value);
  }
  return params.toString();
});

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (activeTab.value === 'proposals') {
      const response = await api<{ items: AdminAnnotationProposal[]; total: number }>('/v1/annotations/proposals?' + query.value);
      proposals.value = response.items;
      total.value = response.total;
    } else {
      const response = await api<{ items: AdminReviewedAnnotation[]; total: number }>('/v1/annotations/reviewed?' + query.value);
      reviewed.value = response.items;
      total.value = response.total;
    }
    if (page.value > 1 && !total.value) { page.value = 1; await load(); return; }
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, '无法读取标注数据，请确认当前账号有管理员权限。').description;
  } finally { loading.value = false; }
}

function setProposalQuery(proposalId: string | null) {
  const query = { ...route.query };
  if (proposalId) query.proposalId = proposalId;
  else delete query.proposalId;
  if (JSON.stringify(query) !== JSON.stringify(route.query)) void router.replace({ path: route.path, query }).catch(() => {});
}

async function openProposal(proposalId: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  selectedDetail.value = null;
  editing.value = false;
  editValue.value = '';
  setProposalQuery(proposalId);
  try { selectedDetail.value = await api<AdminAnnotationProposalDetail>('/v1/annotations/proposals/' + encodeURIComponent(proposalId)); }
  catch (error) { detailError.value = portalErrorDetails(error, '无法读取标注详情。').description; }
  finally { detailLoading.value = false; }
}

function closeProposal() {
  detailOpen.value = false;
  editing.value = false;
  setProposalQuery(null);
}

async function decide(action: 'accept' | 'edit_accept' | 'reject', reviewedValue?: string) {
  if (!selectedDetail.value || saving.value) return;
  detailError.value = '';
  const proposalId = selectedDetail.value.proposal.proposalId;
  if (action === 'edit_accept') {
    editing.value = true;
    editValue.value = reviewedValue ?? selectedDetail.value.proposal.proposedValue ?? selectedDetail.value.proposal.originalValue ?? '';
    return;
  }
  saving.value = true;
  try {
    await api(`/v1/annotations/proposals/${encodeURIComponent(proposalId)}/decision`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId() },
      body: { contractVersion: '1', action },
    });
    toast.add({ title: action === 'accept' ? '已接受该标注' : '已拒绝该标注', color: 'success' });
    closeProposal();
    await load();
  } catch (error) { detailError.value = portalErrorDetails(error, '标注操作未完成，请稍后重试。').description; }
  finally { saving.value = false; }
}

async function saveEditAccept() {
  if (!selectedDetail.value || saving.value || !editValue.value.trim()) return;
  saving.value = true;
  detailError.value = '';
  try {
    await api(`/v1/annotations/proposals/${encodeURIComponent(selectedDetail.value.proposal.proposalId)}/decision`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId() },
      body: { contractVersion: '1', action: 'edit_accept', reviewedValue: editValue.value.trim() },
    });
    toast.add({ title: '已编辑并接受该标注', color: 'success' });
    closeProposal();
    await load();
  } catch (error) { detailError.value = portalErrorDetails(error, '编辑操作未完成，请稍后重试。').description; }
  finally { saving.value = false; }
}

function openDirect(submissionId = '') {
  directSubmissionId.value = submissionId;
  directOpen.value = true;
}

async function onDirectCreated() {
  toast.add({ title: '已创建审定标注', color: 'success' });
  await load();
}

watch(() => route.query.submissionId, (value) => {
  const id = Array.isArray(value) ? value[0] : value;
  if (typeof id !== 'string' || !id.trim()) return;
  openDirect(id.trim());
  const query = { ...route.query };
  delete query.submissionId;
  void router.replace({ path: route.path, query }).catch(() => {});
}, { immediate: true });

watch(() => route.query.proposalId, (value) => {
  const id = Array.isArray(value) ? value[0] : value;
  if (typeof id === 'string' && id.trim()) {
    if (selectedDetail.value?.proposal.proposalId === id || (detailOpen.value && detailLoading.value)) return;
    void openProposal(id);
    return;
  }
  if (detailOpen.value) detailOpen.value = false;
});
watch(detailOpen, (open) => { if (!open) setProposalQuery(null); });

watch([activeTab, proposalState, fieldKey, kind, promptOrigin, reviewedState], () => { page.value = 1; void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title='标注' :count='loading ? "读取中…" : total + " 条"'>
    <template #actions>
      <UButton label='直接标注' icon='i-lucide-pen-line' color='neutral' variant='outline' @click='openDirect()' />
      <UButton class='admin-workspace__icon-action hit-44' icon='i-lucide-refresh-cw' square color='neutral' variant='outline' aria-label='刷新' :loading='loading' @click='load' />
    </template>
    <template #messages>
      <UAlert v-if='errorMessage' color='error' variant='subtle' :description='errorMessage' />
    </template>

    <UTabs v-model='activeTab' :items='[{ label: "待审", value: "proposals" }, { label: "已审", value: "reviewed" }]' class='annotation-tabs' />

    <section v-if='activeTab === "proposals"' aria-label='标注提案队列'>
      <AdminDataTable :data='proposals' :columns='columns' :mobile-columns='[{ id: "field", priority: "primary", order: 0 }, { id: "submissionMapName", priority: "primary", order: 1 }, { id: "proposed", priority: "detail", order: 2 }, { id: "reviewState", priority: "detail", order: 3 }]' row-key='proposalId' :mobile-row-link='(row) => `/admin/annotations?proposalId=${encodeURIComponent(row.proposalId)}`' :loading='loading' empty='暂无匹配提案。' table-key='admin-annotations-proposals' manual-filtering :reset-scroll-key='`${page}-${proposalState}-${fieldKey}-${kind}-${promptOrigin}`'>
        <template #filters><div class='annotation-filters'>
          <USelect v-model='proposalState' aria-label='筛选状态' :items='[{ label: "全部状态", value: "all" }, { label: "待审", value: "pending" }, { label: "已接受", value: "accepted" }, { label: "已拒绝", value: "rejected" }]' />
          <USelect v-model='fieldKey' aria-label='筛选字段' :items='fieldFilterItems' />
          <USelect v-model='kind' aria-label='筛选反馈类型' :items='[{ label: "全部反馈", value: "all" }, { label: "修正", value: "correction" }, { label: "确认", value: "confirmation" }]' />
          <USelect v-model='promptOrigin' aria-label='筛选提示来源' :items='[{ label: "全部来源", value: "all" }, { label: "不确定", value: "uncertainty" }, { label: "冲突", value: "conflict" }, { label: "分组核对", value: "grouped" }, { label: "校准抽查", value: "calibration" }, { label: "被动报告", value: "passive" }]' />
        </div></template>
        <template #mobile-primary><USelect v-model='proposalState' class='w-full' aria-label='筛选状态' :items='[{ label: "全部状态", value: "all" }, { label: "待审", value: "pending" }, { label: "已接受", value: "accepted" }, { label: "已拒绝", value: "rejected" }]' /></template>
        <template #mobile-secondary><div class='annotation-filters'><USelect v-model='fieldKey' aria-label='筛选字段' :items='fieldFilterItems' /><USelect v-model='kind' aria-label='筛选反馈类型' :items='[{ label: "全部反馈", value: "all" }, { label: "修正", value: "correction" }, { label: "确认", value: "confirmation" }]' /><USelect v-model='promptOrigin' aria-label='筛选提示来源' :items='[{ label: "全部来源", value: "all" }, { label: "不确定", value: "uncertainty" }, { label: "冲突", value: "conflict" }, { label: "分组核对", value: "grouped" }, { label: "校准抽查", value: "calibration" }, { label: "被动报告", value: "passive" }]' /></div></template>
        <template #field-cell='{ row }'><strong>{{ fieldLabel(row.original.fieldKey) }}</strong><span class='table-meta'>{{ row.original.fieldKey }}</span></template>
        <template #feedbackType-cell='{ row }'><span>{{ feedbackTypeLabel(row.original.feedbackType) }}</span><span class='table-meta'>{{ originLabel(row.original.promptOrigin) }} · {{ priorityLabel(row.original.priority.category) }}</span></template>
        <template #proposed-cell='{ row }'><span class='annotation-mono'>{{ row.original.proposedValue ?? "—" }}</span></template>
        <template #reviewState-cell='{ row }'><StatusBadge :label='stateLabel(row.original.reviewState)' :tone='row.original.reviewState === "accepted" ? "success" : row.original.reviewState === "rejected" ? "error" : "default"' /></template>
        <template #playerSubmittedAt-cell='{ row }'><span>{{ formatTime(row.original.playerSubmittedAt) }}</span></template>
        <template #actions-cell='{ row }'><div class='table-actions'><UButton label='详情' size='sm' color='neutral' variant='outline' @click='openProposal(row.original.proposalId)' /></div></template>
      </AdminDataTable>
      <UPagination v-if='total > 20' v-model:page='page' :total='total' :items-per-page='20' class='pagination' @update:page='load' />
    </section>

    <section v-else aria-label='已审标注列表'>
      <AdminDataTable :data='reviewed' :columns='reviewedColumns' :mobile-columns='[{ id: "field", priority: "primary", order: 0 }, { id: "submissionMapName", priority: "primary", order: 1 }, { id: "reviewedValue", priority: "detail", order: 2 }, { id: "reviewState", priority: "detail", order: 3 }, { id: "reviewedAt", priority: "detail", order: 4 }]' row-key='annotationId' :loading='loading' empty='暂无已审标注。' table-key='admin-annotations-reviewed' manual-filtering :reset-scroll-key='`${page}-${reviewedState}-${fieldKey}`'>
        <template #filters><div class='annotation-filters'>
          <USelect v-model='reviewedState' aria-label='筛选审定状态' :items='[{ label: "全部状态", value: "all" }, { label: "已接受", value: "accepted" }, { label: "已取代", value: "superseded" }]' />
          <USelect v-model='fieldKey' aria-label='筛选字段' :items='fieldFilterItems' />
        </div></template>
        <template #mobile-primary><USelect v-model='reviewedState' class='w-full' aria-label='筛选审定状态' :items='[{ label: "全部状态", value: "all" }, { label: "已接受", value: "accepted" }, { label: "已取代", value: "superseded" }]' /></template>
        <template #mobile-secondary><div class='annotation-filters'><USelect v-model='fieldKey' aria-label='筛选字段' :items='fieldFilterItems' /></div></template>
        <template #field-cell='{ row }'><strong>{{ fieldLabel(row.original.fieldKey) }}</strong><span class='table-meta'>{{ row.original.modelVersion ?? "—" }} / {{ row.original.layoutVersion ?? "—" }}</span></template>
        <template #reviewedValue-cell='{ row }'><span class='annotation-mono'>{{ row.original.reviewedValue }}</span><span v-if='row.original.normalizedValue' class='table-meta'>规范化：{{ row.original.normalizedValue }}</span></template>
        <template #reviewState-cell='{ row }'><StatusBadge :label='stateLabel(row.original.reviewState)' :tone='row.original.reviewState === "accepted" ? "success" : "default"' /></template>
        <template #reviewedAt-cell='{ row }'><span>{{ formatTime(row.original.reviewedAt) }}</span><span class='table-meta'>{{ row.original.reviewedBy }}</span></template>
      </AdminDataTable>
      <UPagination v-if='total > 20' v-model:page='page' :total='total' :items-per-page='20' class='pagination' @update:page='load' />
    </section>

    <AdminResponsiveDialog v-model:open='detailOpen' title='标注提案' description='审定后不会影响截图审核结果。' size='lg' @update:open='(open) => { if (!open) closeProposal(); }'>
      <template #body>
        <UAlert v-if='detailError' color='error' variant='subtle' :description='detailError' class='annotation-dialog-error' />
        <p v-if='detailLoading' class='annotation-dialog-message' role='status'>读取详情…</p>
        <AdminAnnotationProposalDetail v-else-if='selectedDetail' :detail='selectedDetail' />
        <div v-if='editing' class='annotation-edit'>
          <UInput v-model='editValue' size='md' placeholder='审定后的准确值' aria-label='审定值' />
        </div>
      </template>
      <template v-if='!detailLoading && selectedDetail && (editing || selectedDetail.proposal.reviewState === "pending")' #footer>
        <template v-if='editing'>
          <UButton label='取消' color='neutral' variant='outline' :disabled='saving' @click='editing = false' />
          <UButton label='保存审定' color='primary' :loading='saving' :disabled='saving || !editValue.trim()' @click='saveEditAccept' />
        </template>
        <template v-else-if='selectedDetail.proposal.reviewState === "pending"'>
          <UButton label='拒绝' color='error' variant='outline' :disabled='saving' @click='decide("reject")' />
          <UButton label='编辑并接受' color='neutral' variant='outline' :disabled='saving' @click='decide("edit_accept")' />
          <UButton label='接受' color='primary' :loading='saving' :disabled='saving' @click='decide("accept")' />
        </template>
      </template>
    </AdminResponsiveDialog>

    <AdminAnnotationDirectDialog v-model:open='directOpen' :initial-submission-id='directSubmissionId' @created='onDirectCreated' />
  </AdminWorkspace>
</template>

<style scoped>
.annotation-tabs { margin-bottom: 16px; }
.annotation-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.annotation-filters > * { min-width: 8.5rem; }
.annotation-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; overflow-wrap: anywhere; }
.annotation-dialog-error { margin-bottom: 12px; }
.annotation-dialog-message { margin: 0; padding: 40px 0; color: var(--muted); text-align: center; }
.annotation-edit { display: grid; gap: 10px; margin-top: 14px; }
.pagination { display: flex; justify-content: center; margin-top: 10px; }
.table-meta { display: block; color: var(--quiet); font-size: .78rem; overflow-wrap: anywhere; }
@media (max-width: 620px) {
  .annotation-filters { display: grid; grid-template-columns: 1fr; width: 100%; gap: 12px; }
  .annotation-filters > * { min-width: 0; }
}
</style>
