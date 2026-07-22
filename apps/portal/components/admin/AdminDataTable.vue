<script setup lang="ts" generic="TData extends Record<string, unknown>">
import type { TableColumn } from "@nuxt/ui";
import type { ColumnPinningState, GroupingOptions, GroupingState, SortingState } from "@tanstack/vue-table";

type TableControlOption = { id: string; label: string };
const defaultSelection = "__default__";

function hasSameSorting(left: SortingState, right: SortingState) {
  return left.length === right.length && left.every(
    (sort, index) => sort.id === right[index]?.id && sort.desc === right[index]?.desc,
  );
}

type TableVirtualizeOptions = {
  estimateSize?: number | ((index: number) => number);
  getScrollElement?: () => HTMLElement | null;
  overscan?: number;
  [key: string]: unknown;
};

type Props = {
  columns: TableColumn<TData>[];
  data: TData[];
  empty: string;
  loading?: boolean;
  manualFiltering?: boolean;
  sortingOptions?: TableControlOption[];
  groupingOptions?: TableControlOption[];
  defaultSorting?: SortingState;
  tableGroupingOptions?: GroupingOptions;
  scrollHeight?: string;
  tableMinWidth?: string;
  tableKey: string;
  resetScrollKey?: string | number;
  sticky?: boolean | "header" | "footer";
  virtualize?: boolean | TableVirtualizeOptions;
};

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  manualFiltering: false,
  sortingOptions: () => [],
  groupingOptions: () => [],
  defaultSorting: () => [],
  tableGroupingOptions: undefined,
  scrollHeight: undefined,
  tableMinWidth: undefined,
  resetScrollKey: undefined,
  sticky: "header",
  virtualize: false,
});
const defaultScrollHeight = "clamp(14rem, calc(100dvh - 18rem), 42rem)";
const tableScrollHeight = computed(() => props.scrollHeight ?? defaultScrollHeight);

const globalFilter = defineModel<string>("globalFilter", { default: "" });
const columnFilters = defineModel<Array<{ id: string; value: unknown }>>("columnFilters", { default: () => [] });
const sorting = defineModel<SortingState>("sorting", { default: () => [] });
const grouping = defineModel<GroupingState>("grouping", { default: () => [] });
const columnPinning = defineModel<ColumnPinningState>("columnPinning", { default: () => ({ left: [], right: [] }) });
const columnVisibility = useTableColumnVisibility(props.tableKey);
const controls = useTemplateRef<HTMLElement>("controls");
const scrollContainer = useTemplateRef<HTMLElement>("scrollContainer");
const slots = useSlots();
const tableSlots = Object.fromEntries(Object.entries(slots).filter(([name]) => name !== "filters"));
const tableUi = computed(() => ({
  caption: "not-sr-only",
  root: "overflow-visible",
}));
const tableVirtualize = computed<boolean | TableVirtualizeOptions>(() => {
  if (!props.virtualize) return false;
  const options = typeof props.virtualize === "object" ? props.virtualize : {};
  return { ...options, getScrollElement: () => scrollContainer.value };
});
let controlsResizeObserver: ResizeObserver | undefined;

const sortingItems = computed(() => [
  { label: "默认顺序", value: defaultSelection },
  ...props.sortingOptions.flatMap((option) => [
    { label: `${option.label}：升序`, value: `${option.id}:asc` },
    { label: `${option.label}：降序`, value: `${option.id}:desc` },
  ]),
]);
const groupingItems = computed(() => [
  { label: "不分组", value: defaultSelection },
  ...props.groupingOptions.map((option) => ({ label: `按${option.label}分组`, value: option.id })),
]);
const sortingSelection = computed({
  get: () => {
    if (hasSameSorting(sorting.value, props.defaultSorting)) return defaultSelection;

    const primary = sorting.value[0];
    return primary ? `${primary.id}:${primary.desc ? "desc" : "asc"}` : defaultSelection;
  },
  set: (value: string) => {
    const [id = "", direction] = value.split(":");
    sorting.value = value === defaultSelection || !id ? [...props.defaultSorting] : [{ id, desc: direction === "desc" }];
  },
});
const groupingSelection = computed({
  get: () => grouping.value[0] ?? defaultSelection,
  set: (value: string) => { grouping.value = value === defaultSelection ? [] : [value]; },
});

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

onMounted(() => {
  if (!controls.value || !scrollContainer.value) return;
  const updateControlsHeight = () => {
    scrollContainer.value?.style.setProperty("--admin-table-controls-height", `${controls.value?.offsetHeight ?? 0}px`);
  };
  controlsResizeObserver = new ResizeObserver(updateControlsHeight);
  controlsResizeObserver.observe(controls.value);
  updateControlsHeight();
});

onBeforeUnmount(() => controlsResizeObserver?.disconnect());
</script>

<template>
  <div class="admin-data-table" :style="props.tableMinWidth ? { '--admin-table-min-width': props.tableMinWidth } : undefined">
    <div ref="scrollContainer" class="admin-data-table__scroll admin-data-table__scroll--bounded" :style="{ height: tableScrollHeight }">
      <UTable
        v-model:column-visibility="columnVisibility"
        v-model:column-filters="columnFilters"
        v-model:global-filter="globalFilter"
        v-model:sorting="sorting"
        v-model:grouping="grouping"
        v-model:column-pinning="columnPinning"
        :columns="columns"
        :data="data"
        :empty="empty"
        :loading="loading"
        :manual-filtering="manualFiltering"
        :grouping-options="props.tableGroupingOptions"
        :ui="tableUi"
        :sticky="props.sticky"
        :virtualize="tableVirtualize"
      >
        <template #caption>
          <div ref="controls" class="admin-data-table__controls">
            <div v-if="$slots.filters" class="admin-data-table__filters"><slot name="filters" /></div>
            <USelect v-if="props.sortingOptions.length" v-model="sortingSelection" aria-label="排序方式" size="md" :items="sortingItems" />
            <USelect v-if="props.groupingOptions.length" v-model="groupingSelection" aria-label="分组方式" size="md" :items="groupingItems" />
            <UDropdownMenu :items="columnMenuItems" :content="{ align: 'end' }">
              <UButton label="列" color="neutral" variant="outline" size="md" trailing-icon="i-lucide-chevron-down" />
            </UDropdownMenu>
          </div>
        </template>
        <template v-for="(_, name) in tableSlots" :key="name" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps" />
        </template>
      </UTable>
    </div>
  </div>
</template>

<style scoped>
.admin-data-table { overflow: clip; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.admin-data-table :deep([data-slot="caption"]) { position: sticky; z-index: 2; top: 0; width: auto; height: auto; margin: 0; padding: 0; overflow: visible; clip: auto; white-space: normal; background: var(--surface); }
.admin-data-table__controls { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border-bottom: 1px solid var(--line); }
.admin-data-table__filters { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
.admin-data-table__scroll { overflow: visible; }
.admin-data-table__scroll--bounded { overflow: auto; overscroll-behavior: contain; }
.admin-data-table :deep(table[data-slot="base"]) { width: 100%; min-width: var(--admin-table-min-width, 0); table-layout: fixed; }
.admin-data-table :deep([data-slot="thead"]) { top: var(--admin-table-controls-height, 0px); }
.admin-data-table :deep([data-slot="th"]) { color: var(--quiet); font-size: .72rem; font-weight: 700; letter-spacing: .025em; }
.admin-data-table :deep([data-slot="th"]), .admin-data-table :deep([data-slot="td"]) { padding: 13px 14px; }
.admin-data-table :deep([data-slot="td"]) { vertical-align: middle; white-space: normal !important; }
@media (max-width: 620px) { .admin-data-table { margin-inline: -2px; }.admin-data-table__controls { align-items: stretch; flex-direction: column; }.admin-data-table__filters { width: 100%; }.admin-data-table__filters > :first-child { flex: 1; }.admin-data-table :deep(table[data-slot="base"]) { min-width: 560px; } }
</style>
