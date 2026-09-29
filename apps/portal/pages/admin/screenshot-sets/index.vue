<script setup lang='ts'>
import type { TableColumn } from '@nuxt/ui';
import type { AdminScreenshotSet, AdminScreenshotSetCandidate, AdminScreenshotSetCreateResponse, AdminScreenshotSetDetail } from '~/composables/useAdminApi';
import { createRequestId } from '~/utils/request-id';
import { portalErrorDetails } from '~/utils/portal-error';

definePageMeta({ middleware: ['auth', 'admin-client'] });
useSeoMeta({ title: '截图集 · 躲避堡垒 3' });

const api = useAdminApi();
const toast = useToast();
const sets = ref<AdminScreenshotSet[]>([]);
const errorMessage = ref('');
const page = ref(1);
const total = ref(0);
const statusFilter = ref<'all' | AdminScreenshotSet['status']>('all');
const creating = ref(false);
const selectedDetail = ref<AdminScreenshotSetDetail | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const finalizing = ref(false);
const draftDialogOpen = ref(false);
const draftCandidates = ref<AdminScreenshotSetCandidate[]>([]);
const excludedSourceIds = ref<string[]>([]);
const draftCandidatesLoading = ref(false);

const formatTime = (value: number) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
const statusLabel = (status: string) => status === 'draft' ? '草稿' : '已定稿';
const accuracyLabel = (accuracy: AdminScreenshotSetCandidate['accuracy']) => accuracy === 'inaccurate' ? '不准确' : accuracy === 'accurate' ? '准确' : '未标记';
const exclusionReasonLabel = (reason: string) => ({ missing_layout_version: '缺少布局版本', missing_evidence: '缺少已保存截图', maintainer_excluded: '维护者排除异常' })[reason] ?? reason;

const columns: TableColumn<AdminScreenshotSet>[] = [
  { id: 'version', accessorKey: 'version', header: '版本' },
  { accessorKey: 'status', header: '状态' },
  { id: 'counts', accessorFn: (row) => `${row.counts.memberCount}/${row.counts.excludedCount}`, header: '成员/排除' },
  { accessorKey: 'createdAt', header: '创建时间' },
  { id: 'actions', header: '', enableHiding: false },
];

const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: '20' });
  if (statusFilter.value !== 'all') params.set('status', statusFilter.value);
  return params.toString();
});

async function load() {
  errorMessage.value = '';
  await adminData.refresh();
}

const adminData = useAdminAsyncData('screenshot-sets', async () => {
  const response = await api<{ items: AdminScreenshotSet[]; total: number }>('/v1/screenshot-sets?' + query.value);
  if (page.value > 1 && !response.items.length && response.total) page.value -= 1;
  return response;
}, {
  cacheKey: query,
  onStart: () => { errorMessage.value = ''; },
  onData: (response) => { sets.value = response.items; total.value = response.total; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, '无法读取截图集，请确认当前账号有管理员权限。').description; },
});
const loading = adminData.loading;

async function openDraftDialog() {
  if (draftCandidatesLoading.value) return;
  draftCandidatesLoading.value = true;
  errorMessage.value = '';
  try {
    const candidates: AdminScreenshotSetCandidate[] = [];
    let currentPage = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await api<{ items: AdminScreenshotSetCandidate[]; hasMore: boolean }>(`/v1/screenshot-sets/candidates?page=${currentPage}&pageSize=100`);
      candidates.push(...response.items);
      hasMore = response.hasMore;
      currentPage += 1;
    }
    draftCandidates.value = candidates;
    excludedSourceIds.value = [];
    draftDialogOpen.value = true;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, '无法读取候选截图，未创建截图集草稿。').description;
  } finally { draftCandidatesLoading.value = false; }
}

async function createDraft() {
  if (creating.value) return;
  creating.value = true;
  errorMessage.value = '';
  try {
    const response = await api<AdminScreenshotSetCreateResponse>('/v1/screenshot-sets', {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId() },
      body: { contractVersion: '1', ...(excludedSourceIds.value.length ? { excludedSourceIds: excludedSourceIds.value } : {}) },
    });
    toast.add({ title: `已创建 v${response.version} 草稿`, description: `入选 ${response.counts.memberCount} 张，排除 ${response.counts.excludedCount} 张。`, color: 'success' });
    draftDialogOpen.value = false;
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, '无法创建截图集草稿。').description;
  } finally { creating.value = false; }
}

async function openDetail(setId: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  selectedDetail.value = null;
  try { selectedDetail.value = await api<AdminScreenshotSetDetail>('/v1/screenshot-sets/' + encodeURIComponent(setId)); }
  catch (error) { detailError.value = portalErrorDetails(error, '无法读取截图集详情。').description; }
  finally { detailLoading.value = false; }
}

function closeDetail() {
  detailOpen.value = false;
}

async function finalize() {
  if (!selectedDetail.value || finalizing.value) return;
  finalizing.value = true;
  detailError.value = '';
  try {
    const response = await api<{ status: 'finalized'; version: number }>(`/v1/screenshot-sets/${encodeURIComponent(selectedDetail.value.set.setId)}/finalize`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId() },
      body: { contractVersion: '1' },
    });
    toast.add({ title: `v${response.version} 已定稿`, color: 'success' });
    closeDetail();
    await load();
  } catch (error) { detailError.value = portalErrorDetails(error, '定稿未完成，请稍后重试。').description; }
  finally { finalizing.value = false; }
}

watch(statusFilter, () => { page.value = 1; }, { flush: 'sync' });
</script>

<template>
  <AdminWorkspace title='截图集' :count='loading ? "读取中…" : total + " 个"'>
    <template #actions>
      <UButton label='创建截图集' icon='i-lucide-images' color='primary' :loading='draftCandidatesLoading' @click='openDraftDialog' />
      <UButton class='admin-workspace__icon-action hit-target-lg' icon='i-lucide-refresh-cw' square color='neutral' variant='outline' aria-label='刷新' :loading='loading' @click='load' />
    </template>
    <template #messages>
      <UAlert v-if='errorMessage' color='error' variant='subtle' :description='errorMessage' />
    </template>

    <section aria-label='截图集列表'>
      <AdminDataTable :data='sets' :columns='columns' :mobile-columns='[{ id: "version", priority: "primary", order: 0 }, { id: "status", priority: "primary", order: 1 }, { id: "counts", priority: "detail", order: 2 }]' row-key='setId' :mobile-row-action='(row) => openDetail(row.setId)' :loading='loading' empty='暂无截图集。' table-key='admin-screenshot-sets' manual-filtering :reset-scroll-key='`${page}-${statusFilter}`'>
        <template #filters><div class='set-filters'>
          <USelect v-model='statusFilter' aria-label='筛选状态' :items='[{ label: "全部状态", value: "all" }, { label: "草稿", value: "draft" }, { label: "已定稿", value: "finalized" }]' />
        </div></template>
        <template #mobile-primary><USelect v-model='statusFilter' class='w-full' aria-label='筛选状态' :items='[{ label: "全部状态", value: "all" }, { label: "草稿", value: "draft" }, { label: "已定稿", value: "finalized" }]' /></template>
        <template #status-cell='{ row }'><StatusBadge :label='statusLabel(row.original.status)' :tone='row.original.status === "finalized" ? "success" : "default"' /></template>
        <template #counts-cell='{ row }'><span>{{ row.original.counts.memberCount }} 张入选</span><span class='table-meta'>排除 {{ row.original.counts.excludedCount }} 张</span></template>
        <template #createdAt-cell='{ row }'><span>{{ formatTime(row.original.createdAt) }}</span><span class='table-meta'>{{ row.original.createdBy }}</span></template>
        <template #actions-cell='{ row }'><div class='table-actions'><UButton label='详情' size='sm' color='neutral' variant='outline' @click='openDetail(row.original.setId)' /></div></template>
      </AdminDataTable>
      <UPagination v-if='total > 20' v-model:page='page' :total='total' :items-per-page='20' class='pagination' />
    </section>

    <AdminResponsiveDialog v-model:open='draftDialogOpen' title='创建截图集草稿' description='默认包含全部合格截图（已通过审核的提交，以及当前识别被标记为不准确的截图）。选中异常项可仅从本次集合排除。' size='lg'>
      <template #body>
        <p class='set-dialog-message'>合格候选 {{ draftCandidates.length }} 张 · 本次排除 {{ excludedSourceIds.length }} 张</p>
        <div v-if='draftCandidates.length' class='set-candidate-list'>
          <label v-for='candidate in draftCandidates' :key='candidate.sourceId' class='set-candidate'>
            <input v-model='excludedSourceIds' type='checkbox' :value='candidate.sourceId' />
            <img v-if='candidate.evidenceUrl' :src='candidate.evidenceUrl' class='set-thumb' alt='' loading='lazy' />
            <span><strong>{{ candidate.mapName }}</strong><span class='table-meta'>{{ accuracyLabel(candidate.accuracy) }} · {{ candidate.layoutVersion }}</span></span>
          </label>
        </div>
        <p v-else class='set-dialog-message'>当前没有合格截图。</p>
      </template>
      <template #footer>
        <UButton label='创建草稿' icon='i-lucide-images' color='primary' :loading='creating' :disabled='creating' @click='createDraft' />
      </template>
    </AdminResponsiveDialog>

    <AdminResponsiveDialog v-model:open='detailOpen' :title="selectedDetail ? `截图集 v${selectedDetail.set.version}` : '截图集'" :description="selectedDetail?.set.status === 'finalized' ? '已定稿集合的成员与来源不可再变更，OCRKit 可读取此版本。' : '草稿仅对维护者可见；定稿后成员与来源不再变更。'" size='lg' @update:open='(open) => { if (!open) closeDetail(); }'>
      <template #body>
        <UAlert v-if='detailError' color='error' variant='subtle' :description='detailError' class='set-dialog-error' />
        <p v-if='detailLoading' class='set-dialog-message' role='status'>读取详情…</p>
        <template v-else-if='selectedDetail'>
          <dl class='set-facts'>
            <div><dt>版本</dt><dd>v{{ selectedDetail.set.version }}</dd></div>
            <div><dt>状态</dt><dd><StatusBadge :label='statusLabel(selectedDetail.set.status)' :tone='selectedDetail.set.status === "finalized" ? "success" : "default"' /></dd></div>
            <div><dt>创建时间</dt><dd>{{ formatTime(selectedDetail.set.createdAt) }}</dd></div>
            <div><dt>定稿时间</dt><dd>{{ selectedDetail.set.finalizedAt ? formatTime(selectedDetail.set.finalizedAt) : "—" }}</dd></div>
            <div><dt>入选 / 排除</dt><dd>{{ selectedDetail.set.counts.memberCount }} / {{ selectedDetail.set.counts.excludedCount }}</dd></div>
          </dl>
          <div v-if='selectedDetail.members.length' class='set-members'>
            <h3>成员截图（{{ selectedDetail.members.length }}）</h3>
            <ul>
              <li v-for='member in selectedDetail.members' :key='member.sourceId'>
                <img v-if='member.evidenceUrl' :src='member.evidenceUrl' class='set-thumb' alt='' loading='lazy' />
                <div><strong>{{ member.mapName }}</strong><span class='table-meta'>{{ accuracyLabel(member.accuracy) }} · {{ member.layoutVersion }}</span></div>
                <div class='set-mono'>{{ member.mimeType }} · {{ member.sizeBytes }} B</div>
              </li>
            </ul>
          </div>
          <div v-if='selectedDetail.exclusions.length' class='set-exclusions'>
            <h3>排除记录（{{ selectedDetail.exclusions.length }}）</h3>
            <ul>
              <li v-for='(exclusion, index) in selectedDetail.exclusions' :key='exclusion.sourceId ?? index'>
                <span class='set-mono'>{{ exclusion.submissionId }}</span><span class='table-meta'>{{ exclusionReasonLabel(exclusion.reason) }}</span>
              </li>
            </ul>
          </div>
        </template>
      </template>
      <template v-if='selectedDetail?.set.status === "draft"' #footer>
        <UButton label='定稿' color='primary' :loading='finalizing' :disabled='finalizing' @click='finalize' />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.set-filters { display: grid; grid-template-columns: minmax(140px, 220px); }
.set-dialog-error { margin-bottom: var(--space-3); }
.set-dialog-message { margin: 0; padding: var(--space-8) 0; color: var(--muted); text-align: center; }
.set-candidate-list { display: grid; max-height: 55vh; gap: var(--space-2); overflow: auto; }
.set-candidate { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); }
.set-candidate > span { display: grid; gap: var(--space-1); min-width: 0; overflow-wrap: anywhere; }
.set-thumb { width: 96px; height: 54px; object-fit: cover; border-radius: var(--radius-control); background: var(--muted); flex: none; }
.set-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: 0 0 var(--space-5); }
.set-facts > div { display: grid; gap: var(--space-1); min-width: 0; }
.set-facts dt { color: var(--quiet); font-size: .74rem; }
.set-facts dd { margin: 0; color: var(--text); font-size: .86rem; }
.set-members h3, .set-exclusions h3 { margin: 0 0 var(--space-3); font-size: .9rem; font-weight: 600; }
.set-members ul, .set-exclusions ul { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.set-members li, .set-exclusions li {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.set-members li { grid-template-columns: auto minmax(0, 1fr); align-items: center; }
.set-members .set-mono { grid-column: 1 / -1; }
.set-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; overflow-wrap: anywhere; }
.pagination { display: flex; justify-content: center; margin-top: var(--space-3); }
@media (max-width: 47.99rem) {
  .set-facts { grid-template-columns: minmax(0, 1fr); }
}
</style>
