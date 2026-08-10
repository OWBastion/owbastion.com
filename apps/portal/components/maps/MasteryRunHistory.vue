<script setup lang="ts">
import type { CurrentPlayerMasteryResponse } from "~/composables/usePortalApi";
import { formatMasteryDuration } from "~/utils/mastery";

const props = defineProps<{
  mapName: string;
  history: CurrentPlayerMasteryResponse | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  "change-page": [page: number];
  retry: [];
}>();

const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
const currentPage = computed(() => props.history?.page ?? 1);
const pageSize = computed(() => props.history?.pageSize ?? 10);
const totalPages = computed(() => Math.max(1, Math.ceil((props.history?.total ?? 0) / pageSize.value)));
</script>

<template>
  <section class="mastery-history" aria-labelledby="mastery-history-title">
    <div class="mastery-history-heading"><h3 id="mastery-history-title">通关记录</h3><span v-if="history">{{ history.total }} 条</span></div>
    <div v-if="loading" class="mastery-history-loading" role="status" aria-label="读取通关记录…"><USkeleton /><USkeleton /></div>
    <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取通关记录" :description="error">
      <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="emit('retry')" /></template>
    </UAlert>
    <UEmpty v-else-if="!history?.runs.length" title="暂无通关记录" variant="naked" />
    <template v-else>
      <ol class="mastery-history-list">
        <li v-for="run in history.runs" :key="run.runId">
          <div class="mastery-history-copy"><strong>{{ mapName }} · {{ run.difficulty }}</strong><span><time :datetime="new Date(run.acceptedAt).toISOString()">{{ formatDate(run.acceptedAt) }}</time> · {{ formatMasteryDuration(run.completionDurationSeconds) }}</span></div>
          <div class="mastery-history-outcome"><strong>{{ run.awardedXp }} XP</strong><UBadge v-if="run.status !== 'active'" label="已失效" color="neutral" variant="subtle" /></div>
        </li>
      </ol>
      <nav v-if="history.total > history.pageSize" class="mastery-history-pagination" aria-label="通关记录分页">
        <UButton label="上一页" color="neutral" variant="outline" size="sm" :disabled="currentPage <= 1" @click="emit('change-page', currentPage - 1)" />
        <span>第 {{ currentPage }} / {{ totalPages }} 页</span>
        <UButton label="下一页" color="neutral" variant="outline" size="sm" :disabled="!history.hasMore" @click="emit('change-page', currentPage + 1)" />
      </nav>
    </template>
  </section>
</template>

<style scoped>
.mastery-history { display: grid; gap: 12px; }
.mastery-history-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mastery-history-heading h3 { margin: 0; color: var(--text); font-size: .9rem; letter-spacing: -.02em; }
.mastery-history-heading > span { color: var(--quiet); font-size: .75rem; }
.mastery-history-loading { display: grid; gap: 9px; }.mastery-history-loading > * { height: 64px; border-radius: 12px; }
.mastery-history-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
.mastery-history-list li { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; padding: 13px 0; border-bottom: 1px solid var(--line); }
.mastery-history-copy { display: grid; min-width: 0; gap: 4px; }.mastery-history-copy strong { overflow-wrap: anywhere; color: var(--text); font-size: .82rem; }.mastery-history-copy span { color: var(--quiet); font-size: .73rem; }
.mastery-history-outcome { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }.mastery-history-outcome > strong { color: var(--accent); font-size: .8rem; }
.mastery-history-pagination { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.mastery-history-pagination > span { color: var(--quiet); font-size: .75rem; }
@media (max-width: 360px) { .mastery-history-list li { align-items: flex-start; flex-direction: column; gap: 8px; }.mastery-history-outcome { flex-wrap: wrap; }.mastery-history-pagination { display: grid; grid-template-columns: 1fr 1fr; }.mastery-history-pagination > span { grid-column: 1 / -1; grid-row: 1; text-align: center; }.mastery-history-pagination :deep(button) { width: 100%; justify-content: center; } }
</style>
