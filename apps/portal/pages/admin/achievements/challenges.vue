<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import {
  type AchievementStatus,
  type AdminAchievement,
  type TitleAchievement,
  isChallengeTitle,
  isTitle,
  itemIdentity,
} from "~/components/admin/admin-achievement-types";
import { useAdminAchievementWorkspace } from "~/components/admin/useAdminAchievementWorkspace";
import { mapVariantLabel } from "~/utils/map-variant";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "通用挑战 · 躲避堡垒 3" });

type TableCell<Item> = {
  row: { id: string; original: Item };
  getContext(): { table: { getRowModel(): { rows: Array<{ id: string; original: Item }> } } };
};

const workspace = useAdminAchievementWorkspace();
const { items, loading, errorMessage, editingId, planningId, retirementVersions, updatedCatalogIds, achievementStatusText, achievementItemStatusTone, isSaving, openCreate, openEnd, reopen, toggleEditing, planSunsetting } = workspace;

const titleStatus = ref<"all" | AchievementStatus>("all");
const defaultTitleSorting: SortingState = [
  { id: "category", desc: false },
  { id: "titleName", desc: false },
];
const titleSorting = shallowRef<SortingState>([...defaultTitleSorting]);
const titleSortingOptions = [
  { id: "category", label: "系列" },
  { id: "titleName", label: "称号" },
  { id: "status", label: "状态" },
];
const itemCategory = (item: AdminAchievement) => isTitle(item) ? item.category : "";
const itemTitleName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
const itemScope = (item: AdminAchievement) => isTitle(item) && item.family === "title_catalog" ? item.scope : "";
const titleStatusFilters = computed({
  get: () => titleStatus.value === "all" ? [] : [{ id: "status", value: titleStatus.value }],
  set: (filters: Array<{ id: string; value: unknown }>) => {
    const value = filters.find((filter) => filter.id === "status")?.value;
    titleStatus.value = value === "scheduled" || value === "active" || value === "sunsetting" || value === "retired" ? value : "all";
  },
});
const titleChallengeItems = computed(() => items.value.filter(isChallengeTitle));
function isGroupContinuation<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  const rows = cell.getContext().table.getRowModel().rows;
  const rowIndex = rows.findIndex((row) => row.id === cell.row.id);
  return rowIndex > 0 && groupValue(rows[rowIndex - 1]!.original) === groupValue(cell.row.original);
}

function getGroupRowSpan<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  // Continuation cells are fully suppressed; only the lead cell keeps a rowspan.
  if (isGroupContinuation(cell, groupValue)) return undefined;
  const rows = cell.getContext().table.getRowModel().rows;
  const rowIndex = rows.findIndex((row) => row.id === cell.row.id);
  const value = groupValue(cell.row.original);
  let span = 1;
  for (let index = rowIndex + 1; index < rows.length; index++) {
    if (groupValue(rows[index]!.original) !== value) break;
    span++;
  }
  return span > 1 ? String(span) : undefined;
}

function getGroupCellClass<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  return isGroupContinuation(cell, groupValue) ? "achievement-group-cell achievement-group-cell--continued" : "achievement-group-cell";
}
const titleColumns: TableColumn<TitleAchievement>[] = [
  {
    accessorKey: "category",
    header: "系列",
    meta: {
      // Nuxt UI types require string; empty string omits a meaningful rowspan in the DOM.
      rowspan: { td: (cell) => getGroupRowSpan(cell, itemCategory) ?? "" },
      class: {
        th: "achievement-col-category",
        td: (cell) => `${getGroupCellClass(cell, itemCategory)} achievement-col-category`,
      },
    },
  },
  { accessorKey: "titleName", header: "称号", meta: { class: { th: "achievement-col-title", td: "achievement-col-title" } } },
  { accessorKey: "condition", header: "完成条件", meta: { class: { th: "achievement-col-condition", td: "achievement-col-condition" } } },
  { accessorKey: "status", header: "状态", meta: { class: { th: "achievement-col-status", td: "achievement-col-status" } } },
  { id: "actions", header: "操作", enableHiding: false, meta: { class: { th: "achievement-col-actions", td: "achievement-col-actions" } } },
];
</script>

<template>
  <AdminWorkspace title="通用挑战">
    <template #actions><UButton label="新建挑战" icon="i-lucide-plus" @click="openCreate" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <AdminAchievementNav />
    <section class="catalog-section" aria-labelledby="title-achievements-title">
      <h2 id="title-achievements-title" class="sr-only">称号挑战</h2>
      <AdminDataTable v-model:column-filters="titleStatusFilters" v-model:sorting="titleSorting" :data="titleChallengeItems" :columns="titleColumns" :loading="loading" :sorting-options="titleSortingOptions" :default-sorting="defaultTitleSorting" empty="暂无记录。" row-key="challengeId" table-key="achievement-titles" table-min-width="860px" class="admin-table achievement-table achievement-table--titles">
        <template #filters>
          <USelect v-model="titleStatus" size="md" aria-label="筛选挑战状态" :items="[{ label: '全部状态', value: 'all' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" />
        </template>
        <template #mobile-secondary>
          <USelect v-model="titleStatus" size="md" aria-label="筛选挑战状态" :items="[{ label: '全部状态', value: 'all' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" />
        </template>
        <template #category-cell="{ row }"><span class="table-meta">{{ itemCategory(row.original) }}</span></template>
        <template #titleName-cell="{ row }">
          <strong>{{ itemTitleName(row.original) }}</strong>
          <small class="table-meta">{{ isChallengeTitle(row.original) ? `${row.original.scope === 'map' ? `${mapVariantLabel(row.original.mapVariant)} · ` : ''}引入版本 ${row.original.introducedVersion ?? '未设置'}` : itemScope(row.original) === 'map' ? '地图称号' : '目录称号' }}</small>
        </template>
        <template #condition-cell="{ row }"><span class="condition-cell">{{ row.original.condition }}</span></template>
        <template #status-cell="{ row }">
          <StatusBadge :class="updatedCatalogIds.has(row.original.challengeId) ? 'row-update-flash' : undefined" :label="achievementStatusText(row.original)" :tone="achievementItemStatusTone(row.original)" />
        </template>
        <template #actions-cell="{ row }">
          <div class="table-actions">
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-pencil" :label="editingId === itemIdentity(row.original) ? '收起' : '编辑'" :aria-label="editingId === itemIdentity(row.original) ? '收起编辑' : '编辑规则'" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)" />
            <UPopover v-if="row.original.status !== 'retired'" :open="planningId === row.original.challengeId" @update:open="(open) => { planningId = open ? row.original.challengeId : null; }">
              <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-calendar-clock" label="计划" aria-label="计划下线" :disabled="isSaving(row.original)" />
              <template #content>
                <UCard class="plan-popover-card">
                  <form class="plan-popover" @submit.prevent="planSunsetting(row.original)">
                    <UFormField label="计划下线版本" required>
                      <UInput v-model="retirementVersions[row.original.challengeId]" required placeholder="例如 26.0713.1" :disabled="isSaving(row.original)" />
                    </UFormField>
                    <UButton type="submit" block label="确认计划" :loading="isSaving(row.original)" :disabled="!retirementVersions[row.original.challengeId]?.trim()" />
                  </form>
                </UCard>
              </template>
            </UPopover>
            <UButton v-if="row.original.status !== 'retired'" size="sm" color="error" variant="soft" icon="i-lucide-square-stop" label="结束" aria-label="结束挑战" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)" />
            <UButton v-else size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" label="重开" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)" />
          </div>
        </template>
      </AdminDataTable>
    </section>
    <AdminAchievementDialogs :workspace="workspace" />
  </AdminWorkspace>
</template>

<style scoped>
.catalog-section { display: grid; gap: var(--space-3); }
.table-meta { color: var(--quiet); font-size: var(--type-caption-size); }

/* Keep fixed layout from AdminDataTable but pin column tracks so header/body stay aligned. */
.achievement-table :deep(table[data-slot="base"]) {
  width: 100%;
  table-layout: fixed;
}
.achievement-table :deep([data-slot="th"]),
.achievement-table :deep([data-slot="td"]) {
  overflow-wrap: anywhere;
  vertical-align: middle;
}
.achievement-table :deep(strong),
.achievement-table :deep(small) { display: block; }
.achievement-table :deep(small) { margin-top: var(--space-1); }

/* Rowspan continuations must not consume a column track. */
.achievement-table :deep(td.achievement-group-cell--continued) {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  border: 0 !important;
}

.achievement-table--titles :deep(.achievement-col-category) { width: 14%; }
.achievement-table--titles :deep(.achievement-col-title) { width: 20%; }
.achievement-table--titles :deep(.achievement-col-condition) { width: 34%; }
.achievement-table--titles :deep(.achievement-col-status) { width: 12%; }
.achievement-table--titles :deep(.achievement-col-actions) { width: 14.5rem; min-width: 14.5rem; }

.condition-cell {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.plan-popover { display: grid; gap: var(--space-3); }
.plan-popover-card { width: min(280px, calc(100vw - 32px)); }
</style>
