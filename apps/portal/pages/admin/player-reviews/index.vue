<script setup lang='ts'>
import type { TableColumn } from '@nuxt/ui';
import type { AdminReview, AdminReviewDetail } from '~/composables/useAdminApi';
import { createRequestId } from '~/utils/request-id';
import { portalErrorDetails } from '~/utils/portal-error';

definePageMeta({ middleware: ['auth', 'admin-client'] });
useSeoMeta({ title: '玩家评价 · 躲避堡垒 3' });

const api = useAdminApi();
const reviews = ref<AdminReview[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const feedback = ref('');
const page = ref(1);
const total = ref(0);
const targetType = ref<'all' | 'event' | 'map'>('all');
const targetId = ref('');
const reviewStatus = ref<'all' | AdminReview['status']>('all');
const commentStatus = ref<'all' | AdminReview['commentStatus']>('all');
const rating = ref<'all' | '1' | '2' | '3' | '4' | '5'>('all');
const selectedDetail = ref<AdminReviewDetail | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const pendingAction = ref<'hide-comment' | 'restore-comment' | 'invalidate' | 'restore' | null>(null);
const reason = ref('');
const saving = ref(false);

const formatTime = (value: number) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
const targetTypeLabel = (value: AdminReview['targetType']) => value === 'event' ? '事件' : '地图';
const statusLabel = (value: AdminReview['status']) => value === 'active' ? '有效' : value === 'withdrawn' ? '已撤回' : '已失效';
const commentStatusLabel = (value: AdminReview['commentStatus']) => value === 'visible' ? '公开' : '已隐藏';
const actionLabel = (value: NonNullable<typeof pendingAction.value>) => ({ 'hide-comment': '隐藏评论', 'restore-comment': '恢复评论', invalidate: '使评价失效', restore: '恢复评价' })[value];

const columns: TableColumn<AdminReview>[] = [
  { id: 'target', accessorFn: (row) => row.targetName, header: '评价目标' },
  { accessorKey: 'rating', header: '评分' },
  { accessorKey: 'playerName', header: '提交玩家' },
  { accessorKey: 'status', header: '评价状态' },
  { accessorKey: 'commentStatus', header: '评论状态' },
  { accessorKey: 'createdAt', header: '提交时间' },
  { id: 'actions', header: '', enableHiding: false },
];

const query = computed(() => {
  const params = new URLSearchParams({ page: String(page.value), pageSize: '20' });
  if (targetType.value !== 'all') params.set('targetType', targetType.value);
  if (targetId.value.trim()) params.set('targetId', targetId.value.trim());
  if (reviewStatus.value !== 'all') params.set('status', reviewStatus.value);
  if (commentStatus.value !== 'all') params.set('commentStatus', commentStatus.value);
  if (rating.value !== 'all') params.set('rating', rating.value);
  return params.toString();
});

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const response = await api<{ items: AdminReview[]; total: number }>('/v1/reviews?' + query.value);
    reviews.value = response.items;
    total.value = response.total;
    if (page.value > 1 && !reviews.value.length && total.value) { page.value -= 1; await load(); }
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, '无法读取玩家评价，请确认当前账号有管理员权限。').description;
  } finally { loading.value = false; }
}

async function openDetail(reviewId: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  pendingAction.value = null;
  try { selectedDetail.value = await api<AdminReviewDetail>('/v1/reviews/' + encodeURIComponent(reviewId)); }
  catch (error) { detailError.value = portalErrorDetails(error, '无法读取评价详情。').description; }
  finally { detailLoading.value = false; }
}

function beginModeration(action: NonNullable<typeof pendingAction.value>) { pendingAction.value = action; reason.value = ''; }
function cancelModeration() { pendingAction.value = null; reason.value = ''; }

async function saveModeration() {
  if (!selectedDetail.value || !pendingAction.value || saving.value) return;
  saving.value = true;
  detailError.value = '';
  const action = pendingAction.value;
  const isComment = action === 'hide-comment' || action === 'restore-comment';
  try {
    selectedDetail.value = await api<AdminReviewDetail>('/v1/reviews/' + encodeURIComponent(selectedDetail.value.review.reviewId) + '/' + (isComment ? 'comment' : 'state'), {
      method: 'POST',
      headers: { 'Idempotency-Key': createRequestId() },
      body: { contractVersion: '1', action: isComment ? action === 'hide-comment' ? 'hide' : 'restore' : action, ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) },
    });
    pendingAction.value = null;
    reason.value = '';
    feedback.value = actionLabel(action) + '已完成。';
    await load();
  } catch (error) { detailError.value = portalErrorDetails(error, '评价操作未完成，请稍后重试。').description; }
  finally { saving.value = false; }
}

watch([targetType, targetId, reviewStatus, commentStatus, rating], () => { page.value = 1; void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title='玩家评价' :count='loading ? "读取中…" : total + " 条"'>
    <template #actions><UButton label='刷新' icon='i-lucide-refresh-cw' color='neutral' variant='outline' :loading='loading' @click='load' /></template>
    <template #messages>
      <UAlert v-if='errorMessage' color='error' variant='subtle' :description='errorMessage' />
      <UAlert v-if='feedback' color='success' variant='subtle' :description='feedback' />
    </template>
    <section aria-label='玩家评价记录'>
      <AdminDataTable :data='reviews' :columns='columns' :mobile-columns='[{ id: "target", priority: "primary", order: 0 }, { id: "rating", priority: "primary", order: 1 }, { id: "playerName", priority: "detail", order: 2 }, { id: "status", priority: "detail", order: 3 }, { id: "commentStatus", priority: "detail", order: 4 }, { id: "createdAt", priority: "detail", order: 5 }]' row-key='reviewId' :loading='loading' empty='暂无匹配评价。' table-key='player-reviews' manual-filtering :reset-scroll-key='`${page}-${targetType}-${reviewStatus}-${commentStatus}-${rating}`'>
        <template #filters><div class='review-filters'><UInput v-model='targetId' size='md' aria-label='按目标筛选' placeholder='事件或地图 ID' /><USelect v-model='targetType' aria-label='筛选目标类型' :items='[{ label: "全部目标", value: "all" }, { label: "随机事件", value: "event" }, { label: "地图", value: "map" } ]' /><USelect v-model='reviewStatus' aria-label='筛选评价状态' :items='[{ label: "全部评价状态", value: "all" }, { label: "有效", value: "active" }, { label: "已撤回", value: "withdrawn" }, { label: "已失效", value: "invalidated" } ]' /><USelect v-model='commentStatus' aria-label='筛选评论状态' :items='[{ label: "全部评论状态", value: "all" }, { label: "公开", value: "visible" }, { label: "已隐藏", value: "hidden" } ]' /><USelect v-model='rating' aria-label='筛选评分' :items='[{ label: "全部评分", value: "all" }, { label: "1 分", value: "1" }, { label: "2 分", value: "2" }, { label: "3 分", value: "3" }, { label: "4 分", value: "4" }, { label: "5 分", value: "5" } ]' /></div></template>
        <template #mobile-primary><UInput v-model='targetId' class='w-full' size='md' aria-label='按目标筛选' placeholder='事件或地图 ID' /></template>
        <template #mobile-secondary><div class='review-filters'><USelect v-model='targetType' aria-label='筛选目标类型' :items='[{ label: "全部目标", value: "all" }, { label: "随机事件", value: "event" }, { label: "地图", value: "map" } ]' /><USelect v-model='reviewStatus' aria-label='筛选评价状态' :items='[{ label: "全部评价状态", value: "all" }, { label: "有效", value: "active" }, { label: "已撤回", value: "withdrawn" }, { label: "已失效", value: "invalidated" } ]' /><USelect v-model='commentStatus' aria-label='筛选评论状态' :items='[{ label: "全部评论状态", value: "all" }, { label: "公开", value: "visible" }, { label: "已隐藏", value: "hidden" } ]' /><USelect v-model='rating' aria-label='筛选评分' :items='[{ label: "全部评分", value: "all" }, { label: "1 分", value: "1" }, { label: "2 分", value: "2" }, { label: "3 分", value: "3" }, { label: "4 分", value: "4" }, { label: "5 分", value: "5" } ]' /></div></template>
        <template #target-cell='{ row }'><strong>{{ row.original.targetName }}</strong><span class='table-meta'>{{ targetTypeLabel(row.original.targetType) }} · {{ row.original.targetId }}</span></template>
        <template #rating-cell='{ row }'><span aria-label='评分'>{{ "★".repeat(row.original.rating) }}</span></template>
        <template #playerName-cell='{ row }'><strong>{{ row.original.playerName }}</strong><span class='table-meta'>{{ row.original.playerId }} · {{ row.original.anonymous ? "公开匿名" : "公开署名" }}</span></template>
        <template #status-cell='{ row }'><StatusBadge :label='statusLabel(row.original.status)' :tone='row.original.status === "active" ? "success" : row.original.status === "invalidated" ? "warning" : "default"' /></template>
        <template #commentStatus-cell='{ row }'><StatusBadge :label='commentStatusLabel(row.original.commentStatus)' :tone='row.original.commentStatus === "visible" ? "success" : "warning"' /></template>
        <template #createdAt-cell='{ row }'><span class='table-meta'>{{ formatTime(row.original.createdAt) }}</span></template>
        <template #actions-cell='{ row }'><div class='table-actions'><UButton label='详情' size='sm' color='neutral' variant='outline' @click='openDetail(row.original.reviewId)' /></div></template>
      </AdminDataTable>
      <UPagination v-if='total > 20' v-model:page='page' :total='total' :items-per-page='20' class='pagination' @update:page='load' />
    </section>
  </AdminWorkspace>

  <AdminResponsiveDialog v-model:open='detailOpen' title='评价详情' description='维护者可查看提交身份；公开匿名只影响玩家侧展示。' size='lg'>
    <template #body>
      <div v-if='detailLoading' class='detail-loading'><USkeleton v-for='index in 5' :key='index' class='h-12' /></div>
      <UAlert v-else-if='detailError' color='error' variant='subtle' :description='detailError' />
      <AdminReviewDetail v-else-if='selectedDetail' :detail='selectedDetail' @moderate='beginModeration' />
    </template>
    <template v-if='pendingAction' #footer>
      <div class='moderation-confirmation'>
        <p>确认{{ actionLabel(pendingAction) }}？理由可选，不填写也可以完成操作。</p>
        <UTextarea v-model='reason' aria-label='操作理由（可选）' placeholder='操作理由（可选）' :rows='3' :disabled='saving' />
        <div class='moderation-confirmation__actions'><UButton label='取消' color='neutral' variant='outline' :disabled='saving' @click='cancelModeration' /><UButton :label='actionLabel(pendingAction)' :color='pendingAction === "invalidate" ? "error" : "primary"' :loading='saving' @click='saveModeration' /></div>
      </div>
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.review-filters { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
.review-filters > :first-child { flex: 1 1 13rem; min-width: 10rem; }
.review-filters > :not(:first-child) { flex: 0 1 10rem; min-width: 9rem; }
.table-meta { display: block; color: var(--quiet); font-size: .78rem; }
.pagination { display: flex; justify-content: center; margin-top: 12px; }
.detail-loading { display: grid; gap: 10px; }
.moderation-confirmation { display: grid; flex: 1 1 100%; gap: 10px; }
.moderation-confirmation p { margin: 0; font-size: .86rem; }
.moderation-confirmation__actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 620px) { .review-filters { display: grid; grid-template-columns: 1fr; }.review-filters > :first-child, .review-filters > :not(:first-child) { min-width: 0; }.moderation-confirmation__actions { justify-content: stretch; }.moderation-confirmation__actions > * { flex: 1 1 50%; min-height: 44px; } }
</style>
