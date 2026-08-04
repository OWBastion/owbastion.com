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

type MobileColumnPriority = "primary" | "detail" | "hidden";
type MobileColumn = { id: string; priority: MobileColumnPriority; order?: number };
type AdminTableColumn<TData> = TableColumn<TData>;

type Props = {
  columns: AdminTableColumn<TData>[];
  mobileColumns?: MobileColumn[];
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
  mobileColumns: () => [],
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
type TableHandle = { tableApi: { getRowModel: () => { rows: Array<{ original: TData }> } } };
const table = useTemplateRef<TableHandle>("table");
const controls = useTemplateRef<HTMLElement>("controls");
const scrollContainer = useTemplateRef<HTMLElement>("scrollContainer");
const slots = useSlots();
const tableSlots = Object.fromEntries(Object.entries(slots).filter(([name]) => name !== "filters"));
const tableUi = { root: "overflow-visible" };
const tableVirtualize = computed<boolean | TableVirtualizeOptions>(() => {
  if (!props.virtualize) return false;
  const options = typeof props.virtualize === "object" ? props.virtualize : {};
  return { ...options, getScrollElement: () => scrollContainer.value };
});
const secondaryControlsOpen = ref(false);
let controlsResizeObserver: ResizeObserver | undefined;
let mobileControlsMediaQuery: MediaQueryList | undefined;
let mobileControlsChangeHandler: (() => void) | undefined;

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

const columnId = (column: AdminTableColumn<TData>) => {
  const accessorKey = "accessorKey" in column ? column.accessorKey : undefined;
  return column.id ?? (typeof accessorKey === "string" ? accessorKey : undefined);
};
const mobileColumns = computed(() => props.columns
  .map((column, index) => ({ column, index, id: columnId(column), config: props.mobileColumns.find((item) => item.id === columnId(column)) }))
  .filter((item): item is { column: AdminTableColumn<TData>; index: number; id: string; config: MobileColumn | undefined } => Boolean(item.id) && item.column.enableHiding !== false)
  .map((item, index) => ({ ...item, priority: item.config?.priority ?? (index < 2 ? "primary" : "detail"), order: item.config?.order ?? index }))
  .filter((item) => item.priority !== "hidden")
  .sort((left, right) => left.order - right.order));
const mobilePrimaryColumns = computed(() => mobileColumns.value.filter((item) => item.priority === "primary"));
const mobileDetailColumns = computed(() => mobileColumns.value.filter((item) => item.priority === "detail"));
const mobileHasDetails = computed(() => mobileDetailColumns.value.length > 0);
const mobileExpanded = ref<Record<number, boolean>>({});
const mobileData = computed(() => {
  const sourceData = props.data;
  globalFilter.value;
  columnFilters.value;
  sorting.value;
  grouping.value;
  return table.value?.tableApi.getRowModel().rows.map((row) => row.original) ?? sourceData;
});
const mobileRow = (original: TData) => ({
  original,
  getIsGrouped: () => false,
  getIsExpanded: () => false,
  toggleExpanded: () => undefined,
  groupingColumnId: undefined,
  subRows: [],
  getValue: (id: string) => {
    const column = props.columns.find((candidate) => columnId(candidate) === id);
    if (!column) return undefined;
    if ("accessorKey" in column && typeof column.accessorKey === "string") return original[column.accessorKey as keyof TData];
    if ("accessorFn" in column && typeof column.accessorFn === "function") return column.accessorFn(original, 0);
    return undefined;
  },
});
const mobileValue = (row: TData, column: AdminTableColumn<TData>) => {
  const key = columnId(column);
  if ("accessorKey" in column && typeof column.accessorKey === "string") return row[column.accessorKey as keyof TData] ?? "—";
  if ("accessorFn" in column && typeof column.accessorFn === "function") return column.accessorFn(row, 0) ?? "—";
  return key ? row[key as keyof TData] ?? "—" : "—";
};

const columnMenuItems = computed(() => props.columns
  .filter((column) => column.enableHiding !== false)
  .flatMap((column) => {
    const id = columnId(column);
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
  const updateControlsHeight = () => {
    scrollContainer.value?.style.setProperty("--admin-table-controls-height", `${controls.value?.offsetHeight ?? 0}px`);
  };
  if (controls.value && scrollContainer.value) {
    controlsResizeObserver = new ResizeObserver(updateControlsHeight);
    controlsResizeObserver.observe(controls.value);
  }
  if (typeof window.matchMedia === "function") {
    mobileControlsMediaQuery = window.matchMedia("(max-width: 620px)");
    mobileControlsChangeHandler = () => { secondaryControlsOpen.value = !mobileControlsMediaQuery?.matches; };
    mobileControlsChangeHandler();
    mobileControlsMediaQuery.addEventListener("change", mobileControlsChangeHandler);
  } else {
    secondaryControlsOpen.value = true;
  }
  updateControlsHeight();
});

onBeforeUnmount(() => {
  controlsResizeObserver?.disconnect();
  if (mobileControlsMediaQuery && mobileControlsChangeHandler) {
    mobileControlsMediaQuery.removeEventListener("change", mobileControlsChangeHandler);
  }
});
</script>

<template>
  <div class="admin-data-table" :style="props.tableMinWidth ? { '--admin-table-min-width': props.tableMinWidth } : undefined">
    <div ref="scrollContainer" class="admin-data-table__scroll admin-data-table__scroll--bounded" :style="{ height: tableScrollHeight }">
      <UTable
        ref="table"
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
        <template v-for="(_, name) in tableSlots" :key="name" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps" />
        </template>
      </UTable>
      <div ref="controls" class="admin-data-table__controls">
        <div v-if="$slots.filters" class="admin-data-table__filters"><slot name="filters" /></div>
        <div class="admin-data-table__secondary-controls">
          <button class="admin-data-table__secondary-controls-trigger" type="button" :aria-expanded="secondaryControlsOpen" :aria-controls="`admin-table-settings-${props.tableKey}`" @click="secondaryControlsOpen = !secondaryControlsOpen">
            <span>表格设置</span><span aria-hidden="true">⌄</span>
          </button>
          <div :id="`admin-table-settings-${props.tableKey}`" class="admin-data-table__secondary-controls-content" :hidden="!secondaryControlsOpen">
            <div v-if="props.sortingOptions.length" class="admin-data-table__sort-control">
              <USelect v-model="sortingSelection" class="w-full" aria-label="排序方式" size="md" :items="sortingItems" :ui="{ content: 'min-w-64', itemLabel: 'whitespace-nowrap overflow-visible text-clip' }" />
            </div>
            <USelect v-if="props.groupingOptions.length" v-model="groupingSelection" aria-label="分组方式" size="md" :items="groupingItems" />
            <UDropdownMenu :items="columnMenuItems" :content="{ align: 'end' }">
              <UButton label="列" color="neutral" variant="outline" size="md" trailing-icon="i-lucide-chevron-down" />
            </UDropdownMenu>
          </div>
        </div>
      </div>
      <div class="admin-data-table__mobile-list" :aria-busy="loading">
        <div v-if="loading" class="admin-data-table__mobile-loading" aria-label="正在加载"><USkeleton v-for="index in 3" :key="index" class="admin-data-table__mobile-skeleton" /></div>
        <p v-else-if="!mobileData.length" class="admin-data-table__mobile-empty">{{ empty }}</p>
        <ul v-else class="admin-data-table__mobile-records">
          <li v-for="(item, index) in mobileData" :key="index" class="admin-data-table__mobile-record">
            <div class="admin-data-table__mobile-primary">
              <div v-for="field in mobilePrimaryColumns" :key="field.id" class="admin-data-table__mobile-field">
                <span class="admin-data-table__mobile-label">{{ typeof field.column.header === 'string' ? field.column.header : field.id }}</span>
                <slot v-if="tableSlots[`${field.id}-cell`]" :name="`${field.id}-cell`" :row="mobileRow(item)" />
                <span v-else>{{ mobileValue(item, field.column) }}</span>
              </div>
            </div>
            <div v-if="mobileHasDetails" class="admin-data-table__mobile-disclosure">
              <button class="admin-data-table__mobile-disclosure-trigger" type="button" :aria-expanded="Boolean(mobileExpanded[index])" @click="mobileExpanded[index] = !mobileExpanded[index]">
                <span>{{ mobileExpanded[index] ? '收起详情' : '查看详情' }}</span><span aria-hidden="true">⌄</span>
              </button>
              <div v-if="mobileExpanded[index]" class="admin-data-table__mobile-details">
                <div v-for="field in mobileDetailColumns" :key="field.id" class="admin-data-table__mobile-field">
                  <span class="admin-data-table__mobile-label">{{ typeof field.column.header === 'string' ? field.column.header : field.id }}</span>
                  <slot v-if="tableSlots[`${field.id}-cell`]" :name="`${field.id}-cell`" :row="mobileRow(item)" />
                  <span v-else>{{ mobileValue(item, field.column) }}</span>
                </div>
              </div>
            </div>
            <div v-if="tableSlots['actions-cell']" class="admin-data-table__mobile-actions">
              <slot name="actions-cell" :row="mobileRow(item)" />
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-data-table { overflow: clip; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.admin-data-table__controls { position: sticky; z-index: 2; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border-bottom: 1px solid var(--line); background: var(--surface); }
.admin-data-table__filters { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
.admin-data-table__secondary-controls { flex: 0 1 auto; min-width: 0; }
.admin-data-table__secondary-controls-trigger { display: none; }
.admin-data-table__secondary-controls-content { display: flex; align-items: center; gap: 10px; }
.admin-data-table__secondary-controls-content[hidden] { display: none; }
.admin-data-table__sort-control { flex: 0 1 16rem; min-width: 16rem; }
.admin-data-table__scroll { overflow: visible; }
.admin-data-table__scroll--bounded { display: flex; flex-direction: column; overflow: auto; overscroll-behavior: contain; }
.admin-data-table__scroll--bounded > .admin-data-table__controls { order: -1; }
.admin-data-table :deep(table[data-slot="base"]) { width: 100%; min-width: var(--admin-table-min-width, 0); table-layout: fixed; }
.admin-data-table :deep([data-slot="thead"]) { top: var(--admin-table-controls-height, 0px); }
.admin-data-table :deep([data-slot="th"]) { color: var(--quiet); font-size: .72rem; font-weight: 700; letter-spacing: .025em; }
.admin-data-table :deep([data-slot="th"]), .admin-data-table :deep([data-slot="td"]) { padding: 13px 14px; }
.admin-data-table :deep([data-slot="td"]) { vertical-align: middle; white-space: normal !important; }
.admin-data-table__mobile-list { display: none; }
.admin-data-table__mobile-records { margin: 0; padding: 0; list-style: none; }
.admin-data-table__mobile-record { padding: 14px; border-bottom: 1px solid var(--line); }
.admin-data-table__mobile-record:last-child { border-bottom: 0; }
.admin-data-table__mobile-primary, .admin-data-table__mobile-details { display: grid; gap: 12px; }
.admin-data-table__mobile-primary { grid-template-columns: minmax(0, 1fr) auto; align-items: start; }
.admin-data-table__mobile-field { display: grid; gap: 4px; min-width: 0; }
.admin-data-table__mobile-label { color: var(--quiet); font-size: .72rem; font-weight: 700; letter-spacing: .025em; }
.admin-data-table__mobile-disclosure { margin-top: 12px; }
.admin-data-table__mobile-disclosure-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; padding: 0; border: 0; border-top: 1px solid var(--line); color: var(--quiet); background: transparent; font: inherit; font-size: .82rem; font-weight: 650; text-align: left; cursor: pointer; }
.admin-data-table__mobile-disclosure-trigger > span:last-child { font-size: 1.1rem; transform: translateY(-2px); }
.admin-data-table__mobile-disclosure-trigger[aria-expanded="true"] > span:last-child { transform: rotate(180deg) translateY(-2px); }
.admin-data-table__mobile-details { padding: 12px 0 2px; }
.admin-data-table__mobile-actions { display: flex; justify-content: flex-end; gap: 8px; min-height: 44px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.admin-data-table__mobile-actions :deep(.table-actions) { justify-content: flex-end; }
.admin-data-table__mobile-empty { margin: 0; padding: 32px 16px; color: var(--quiet); text-align: center; }
.admin-data-table__mobile-loading { display: grid; gap: 1px; padding: 14px; }
.admin-data-table__mobile-skeleton { height: 72px; }
@media (max-width: 620px) {
  .admin-data-table { margin-inline: -2px; }
  .admin-data-table__scroll--bounded { height: auto !important; max-height: min(70dvh, 42rem); overflow-y: auto; }
  .admin-data-table__controls { align-items: center; flex-wrap: wrap; justify-content: flex-start; }
  .admin-data-table__filters { width: 100%; flex: 1 1 100%; }
  .admin-data-table__secondary-controls { display: block; flex: 1 1 auto; min-width: 0; }
  .admin-data-table__secondary-controls-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 10px; color: var(--text); background: var(--surface-raised); font: inherit; font-size: .86rem; font-weight: 650; cursor: pointer; }
  .admin-data-table__secondary-controls-trigger > span:last-child { color: var(--quiet); font-size: 1.1rem; line-height: 1; transform: translateY(-2px); }
  .admin-data-table__secondary-controls-trigger[aria-expanded="true"] > span:last-child { transform: rotate(180deg) translateY(-2px); }
  .admin-data-table__secondary-controls-content { display: grid; gap: 8px; padding-top: 8px; }
  .admin-data-table__sort-control { width: 100%; min-width: 0; flex: 0 0 auto; }
  .admin-data-table__filters > :first-child { flex: 1; }
  .admin-data-table__controls { position: relative; }
  .admin-data-table :deep(table[data-slot="base"]) { display: none; }
  .admin-data-table__mobile-list { display: block; }
}
</style>
