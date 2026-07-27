<script setup lang="ts">
type Holder = { holderName: string; totalCount: number; unclaimedCount: number };
type Filter = "all" | "pending" | "completed";

const props = defineProps<{ holders: Holder[]; selectedHolderName: string; filter: Filter; query: string; loading?: boolean; total: number; page: number; pageSize: number }>();
const emit = defineEmits<{ select: [holder: Holder]; "update:filter": [filter: Filter]; "update:page": [page: number]; "update:query": [query: string] }>();
const filters: Array<{ label: string; value: Filter }> = [
  { label: "全部", value: "all" },
  { label: "有未关联", value: "pending" },
  { label: "已完成", value: "completed" },
];
const filteredHolders = computed(() => props.holders.filter((holder) => props.filter === "all" || (props.filter === "pending" ? holder.unclaimedCount > 0 : holder.unclaimedCount === 0)));
const holderPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const holderInitial = (name: string) => name.slice(0, 1).toUpperCase();
</script>

<template>
  <UCard class="holder-panel" variant="outline">
    <template #header><div class="panel-heading"><div><p class="eyebrow">历史持有者</p><h2>迁移对象</h2></div><UBadge :label="`${total} 位`" color="neutral" variant="subtle" /></div><div class="holder-search" role="search" aria-label="搜索称号记录"><UInput :model-value="query" icon="i-lucide-search" placeholder="搜索持有者或称号" aria-label="搜索历史称号" @update:model-value="emit('update:query', $event)" /></div></template>
    <div class="holder-filters" role="tablist" aria-label="历史持有人筛选">
      <UButton v-for="item in filters" :key="item.value" :label="item.label" :variant="filter === item.value ? 'soft' : 'ghost'" :color="filter === item.value ? 'primary' : 'neutral'" size="sm" role="tab" :aria-selected="filter === item.value" @click="emit('update:filter', item.value)" />
    </div>
    <div v-if="loading" class="holder-state" role="status">读取中…</div>
    <UEmpty v-else-if="!filteredHolders.length" title="暂无匹配持有者" variant="naked" />
    <div v-else class="holder-list" role="listbox" aria-label="历史持有人">
      <button v-for="holder in filteredHolders" :key="holder.holderName" class="holder-item" :class="{ 'holder-item--selected': holder.holderName === selectedHolderName }" type="button" role="option" :aria-selected="holder.holderName === selectedHolderName" @click="emit('select', holder)">
        <span class="holder-avatar" aria-hidden="true">{{ holderInitial(holder.holderName) }}</span>
        <span class="holder-copy"><strong>{{ holder.holderName }}</strong><small>{{ holder.totalCount }} 项称号<span v-if="holder.unclaimedCount"> · {{ holder.unclaimedCount }} 项未关联</span></small></span>
        <UBadge :label="holder.unclaimedCount ? '有未关联' : '已完成'" :color="holder.unclaimedCount ? 'warning' : 'success'" variant="subtle" />
      </button>
    </div>
    <template #footer><div class="holder-pagination"><UPagination :page="page" :total="total" :items-per-page="pageSize" :disabled="loading || holderPages <= 1" @update:page="emit('update:page', $event)" /></div></template>
  </UCard>
</template>

<style scoped>
.holder-panel { min-width: 0; height: 100%; display: flex; flex-direction: column; }
.holder-panel :deep([data-slot="body"]) { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.holder-panel :deep([data-slot="header"]), .holder-panel :deep([data-slot="footer"]) { padding: 18px 20px; }
.panel-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }.panel-heading h2 { margin: 0; font-size: 1.05rem; letter-spacing: -.025em; }.panel-heading .eyebrow { margin-bottom: 4px; }
.holder-search { margin-top: 15px; }.holder-search :deep(.portal-control) { width: 100%; }
.holder-filters { display: flex; gap: 4px; padding: 14px 18px; border-bottom: 1px solid var(--line); overflow-x: auto; }.holder-filters :deep(button) { white-space: nowrap; }
.holder-list { display: grid; flex: 1; min-height: 0; max-height: 560px; overflow-y: auto; overscroll-behavior: contain; }.holder-item { display: flex; align-items: center; gap: 11px; min-width: 0; padding: 14px 18px; border: 0; border-left: 3px solid transparent; color: var(--text); background: transparent; text-align: left; transition: background 160ms ease, transform 100ms ease, border-color 160ms ease; }.holder-item + .holder-item { border-top: 1px solid var(--line); }.holder-item:hover { background: color-mix(in oklch, var(--surface-raised) 64%, transparent); }.holder-item:active { transform: scale(.99); }.holder-item--selected { border-left-color: var(--accent); background: var(--accent-surface); }.holder-avatar { display: grid; flex: 0 0 auto; width: 34px; height: 34px; place-items: center; border-radius: 50%; color: var(--on-accent); background: var(--accent); font-size: .82rem; font-weight: 750; }.holder-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }.holder-copy strong, .holder-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.holder-copy strong { font-size: .86rem; }.holder-copy small { color: var(--quiet); font-size: .72rem; }.holder-state { padding: 28px 18px; color: var(--quiet); text-align: center; }.holder-pagination { display: flex; justify-content: center; }
@media (max-width: 460px) { .holder-item { padding-inline: 14px; } }
@media (max-width: 760px) { .holder-panel { height: auto; }.holder-panel :deep([data-slot="body"]) { display: block; }.holder-list { flex: none; max-height: 420px; } }
@media (prefers-reduced-motion: reduce) { .holder-item { transition: background 120ms ease, border-color 120ms ease; }.holder-item:active { transform: none; } }
</style>
