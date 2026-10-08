<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import type { CatalogTitle } from "~/components/admin/admin-achievement-types";
import { useAdminAchievementWorkspace } from "~/components/admin/useAdminAchievementWorkspace";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号目录 · 躲避堡垒 3" });

const workspace = useAdminAchievementWorkspace();
const { items, loading, errorMessage, updatedCatalogIds, achievementStatusText, achievementItemStatusTone, isSaving, openCreate, openEnd, reopen, toggleEditing } = workspace;

const catalogStatus = ref<"all" | CatalogTitle["lifecycle"]>("all");
const defaultCatalogSorting: SortingState = [
  { id: "category", desc: false },
  { id: "titleName", desc: false },
];
const catalogSorting = shallowRef<SortingState>([...defaultCatalogSorting]);
const catalogSortingOptions = [
  { id: "category", label: "系列" },
  { id: "titleName", label: "称号" },
  { id: "scope", label: "称号范围" },
  { id: "status", label: "状态" },
];
const catalogScopeLabel = (scope: CatalogTitle["scope"]) => scope === "map" ? "地图称号" : "全局称号";
const catalogDisplayKindLabel = (displayKind: CatalogTitle["displayKind"]) => ({ fixed: "固定称号", map_pioneer: "地图名 + 开拓者", map_name_suffix: "地图名 + 后缀称号" })[displayKind];
const catalogColorLabel = (color: CatalogTitle["color"]) => color?.kind === "palette" ? color.name : color?.kind === "rgb" ? `RGB ${color.value.join(", ")}` : color?.kind === "heroColor" ? `英雄色 ${color.index}` : "未设置";
const catalogStatusFilters = computed({
  get: () => catalogStatus.value === "all" ? [] : [{ id: "status", value: catalogStatus.value }],
  set: (filters: Array<{ id: string; value: unknown }>) => {
    const value = filters.find((filter) => filter.id === "status")?.value;
    catalogStatus.value = value === "draft" || value === "active" || value === "retired" ? value : "all";
  },
});
const catalogItems = computed(() => items.value.filter((item): item is CatalogTitle => item.family === "title_catalog"));
const catalogColumns: TableColumn<CatalogTitle>[] = [
  { accessorKey: "titleName", header: "称号", meta: { class: { th: "catalog-col-title", td: "catalog-col-title" } } },
  { accessorKey: "icon", header: "图标", meta: { class: { th: "catalog-col-icon", td: "catalog-col-icon" } } },
  { accessorKey: "category", header: "系列", meta: { class: { th: "catalog-col-category", td: "catalog-col-category" } } },
  { accessorKey: "scope", header: "称号范围", meta: { class: { th: "catalog-col-scope", td: "catalog-col-scope" } } },
  { accessorKey: "displayKind", header: "展示方式", meta: { class: { th: "catalog-col-display", td: "catalog-col-display" } } },
  { accessorKey: "color", header: "颜色", meta: { class: { th: "catalog-col-color", td: "catalog-col-color" } } },
  { id: "linkage", header: "挑战关联", enableHiding: false, meta: { class: { th: "catalog-col-linkage", td: "catalog-col-linkage" } } },
  { accessorKey: "status", header: "状态", meta: { class: { th: "catalog-col-status", td: "catalog-col-status" } } },
  { id: "actions", header: "操作", enableHiding: false, meta: { class: { th: "catalog-col-actions", td: "catalog-col-actions" } } },
];
</script>

<template>
  <AdminWorkspace title="称号目录">
    <template #actions><UButton label="新建挑战" icon="i-lucide-plus" @click="openCreate" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <AdminAchievementNav />
    <section class="catalog-section" aria-labelledby="title-catalog-title">
      <h2 id="title-catalog-title" class="sr-only">称号目录</h2>
      <AdminDataTable v-model:column-filters="catalogStatusFilters" v-model:sorting="catalogSorting" :data="catalogItems" :columns="catalogColumns" :loading="loading" :sorting-options="catalogSortingOptions" :default-sorting="defaultCatalogSorting" empty="暂无称号目录记录。" row-key="challengeId" table-key="achievement-title-catalog" table-min-width="1120px" class="admin-table achievement-table achievement-table--catalog">
        <template #filters>
          <USelect v-model="catalogStatus" size="md" aria-label="筛选称号状态" :items="[{ label: '全部状态', value: 'all' }, { label: '草稿', value: 'draft' }, { label: '已启用', value: 'active' }, { label: '已退休', value: 'retired' }]" />
        </template>
        <template #mobile-secondary>
          <USelect v-model="catalogStatus" size="md" aria-label="筛选称号状态" :items="[{ label: '全部状态', value: 'all' }, { label: '草稿', value: 'draft' }, { label: '已启用', value: 'active' }, { label: '已退休', value: 'retired' }]" />
        </template>
        <template #titleName-cell="{ row }"><strong>{{ row.original.titleName }}</strong></template>
        <template #icon-cell="{ row }"><span class="table-meta">{{ row.original.icon }}</span></template>
        <template #category-cell="{ row }"><span class="table-meta">{{ row.original.category }}</span></template>
        <template #scope-cell="{ row }"><span>{{ catalogScopeLabel(row.original.scope) }}</span></template>
        <template #displayKind-cell="{ row }"><span>{{ catalogDisplayKindLabel(row.original.displayKind) }}</span></template>
        <template #color-cell="{ row }"><span>{{ catalogColorLabel(row.original.color) }}</span></template>
        <template #linkage-cell="{ row }"><span class="table-meta">{{ row.original.hasChallenge ? "有关联挑战" : "无关联挑战" }}</span></template>
        <template #status-cell="{ row }">
          <StatusBadge :class="updatedCatalogIds.has(row.original.challengeId) ? 'row-update-flash' : undefined" :label="achievementStatusText(row.original)" :tone="achievementItemStatusTone(row.original)" />
        </template>
        <template #actions-cell="{ row }">
          <div class="table-actions">
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-pencil" label="编辑" aria-label="编辑状态" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)" />
            <UButton v-if="row.original.lifecycle === 'active'" size="sm" color="error" variant="soft" icon="i-lucide-square-stop" label="退休" aria-label="退休称号" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)" />
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

.achievement-table--catalog :deep(.catalog-col-title) { width: 14%; }
.achievement-table--catalog :deep(.catalog-col-icon) { width: 8%; }
.achievement-table--catalog :deep(.catalog-col-category) { width: 12%; }
.achievement-table--catalog :deep(.catalog-col-scope) { width: 10%; }
.achievement-table--catalog :deep(.catalog-col-display) { width: 14%; }
.achievement-table--catalog :deep(.catalog-col-color) { width: 8%; }
.achievement-table--catalog :deep(.catalog-col-linkage) { width: 14%; }
.achievement-table--catalog :deep(.catalog-col-status) { width: 10%; }
.achievement-table--catalog :deep(.catalog-col-actions) { width: 10.5rem; min-width: 10.5rem; }
</style>
