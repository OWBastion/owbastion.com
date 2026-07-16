<script setup lang="ts" generic="TData extends Record<string, unknown>">
import type { TableColumn } from "@nuxt/ui";

type Props = {
  columns: TableColumn<TData>[];
  data: TData[];
  empty: string;
  loading?: boolean;
  manualFiltering?: boolean;
  scrollHeight?: string;
  tableKey: string;
  resetScrollKey?: string | number;
};

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  manualFiltering: false,
  scrollHeight: undefined,
  resetScrollKey: undefined,
});

const globalFilter = defineModel<string>("globalFilter", { default: "" });
const columnFilters = defineModel<Array<{ id: string; value: unknown }>>("columnFilters", { default: () => [] });
const columnVisibility = useTableColumnVisibility(props.tableKey);
const scrollContainer = useTemplateRef<HTMLElement>("scrollContainer");
const slots = useSlots();
const tableSlots = Object.fromEntries(Object.entries(slots).filter(([name]) => name !== "filters"));

const columnMenuItems = computed(() => props.columns
  .filter((column) => column.enableHiding !== false)
  .flatMap((column) => {
    const accessorKey = "accessorKey" in column ? column.accessorKey : undefined;
    const id = column.id ?? (typeof accessorKey === "string" ? accessorKey : undefined);
    if (!id) return [];
    return [{
      label: typeof column.header === "string" ? column.header : id,
      type: "checkbox" as const,
      checked: columnVisibility.value[id] !== false,
      onUpdateChecked(checked: boolean) {
        columnVisibility.value = { ...columnVisibility.value, [id]: checked };
      },
      onSelect(event: Event) {
        event.preventDefault();
      },
    }];
  }));

watch(() => props.resetScrollKey, () => {
  scrollContainer.value?.scrollTo({ top: 0, left: 0 });
});
</script>

<template>
  <div class="admin-data-table">
    <div class="admin-data-table__controls">
      <div v-if="$slots.filters" class="admin-data-table__filters"><slot name="filters" /></div>
      <UDropdownMenu :items="columnMenuItems" :content="{ align: 'end' }">
        <UButton label="列" color="neutral" variant="outline" size="xs" trailing-icon="i-lucide-chevron-down" />
      </UDropdownMenu>
    </div>
    <div ref="scrollContainer" class="admin-data-table__scroll" :class="{ 'admin-data-table__scroll--bounded': scrollHeight }" :style="scrollHeight ? { maxHeight: scrollHeight } : undefined">
      <UTable
        v-model:column-visibility="columnVisibility"
        v-model:column-filters="columnFilters"
        v-model:global-filter="globalFilter"
        :columns="columns"
        :data="data"
        :empty="empty"
        :loading="loading"
        :manual-filtering="manualFiltering"
        sticky
      >
        <template v-for="(_, name) in tableSlots" :key="name" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps" />
        </template>
      </UTable>
    </div>
  </div>
</template>

<style scoped>
.admin-data-table { overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.admin-data-table__controls { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border-bottom: 1px solid var(--line); }
.admin-data-table__filters { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
.admin-data-table__scroll { overflow: auto; }
.admin-data-table__scroll--bounded { overscroll-behavior: contain; }
.admin-data-table :deep(table[data-slot="base"]) { width: 100%; table-layout: fixed; }
.admin-data-table :deep([data-slot="th"]) { color: var(--quiet); font-size: .72rem; font-weight: 700; letter-spacing: .025em; }
.admin-data-table :deep([data-slot="th"]), .admin-data-table :deep([data-slot="td"]) { padding: 13px 14px; }
.admin-data-table :deep([data-slot="td"]) { vertical-align: middle; white-space: normal !important; }
@media (max-width: 620px) { .admin-data-table { margin-inline: -2px; }.admin-data-table__controls { align-items: stretch; flex-direction: column; }.admin-data-table__filters { width: 100%; }.admin-data-table__filters > :first-child { flex: 1; }.admin-data-table :deep(table[data-slot="base"]) { min-width: 560px; } }
</style>
