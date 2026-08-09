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
type RowKey<TData> = keyof TData | ((row: TData) => string | number);

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
  /** Providing a height opts this table into bounded vertical scrolling. */
  scrollHeight?: string;
  tableMinWidth?: string;
  tableKey: string;
  rowKey: RowKey<TData>;
  mobileRowLink?: (row: TData) => string;
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
  mobileRowLink: undefined,
  sticky: false,
  virtualize: false,
});
const defaultScrollHeight = "clamp(14rem, calc(100dvh - 18rem), 42rem)";
const boundedScroll = computed(() => Boolean(props.scrollHeight || props.virtualize));
const tableScrollHeight = computed(() => props.scrollHeight ?? (props.virtualize ? defaultScrollHeight : undefined));

const globalFilter = defineModel<string>("globalFilter", { default: "" });
const columnFilters = defineModel<Array<{ id: string; value: unknown }>>("columnFilters", { default: () => [] });
const sorting = defineModel<SortingState>("sorting", { default: () => [] });
const grouping = defineModel<GroupingState>("grouping", { default: () => [] });
const columnPinning = defineModel<ColumnPinningState>("columnPinning", { default: () => ({ left: [], right: [] }) });
const columnVisibility = useTableColumnVisibility(props.tableKey);
type TableHandle = { tableApi: { getRowModel: () => { rows: Array<{ original: TData }> } } };
const tableRoot = useTemplateRef<HTMLElement>("tableRoot");
const table = useTemplateRef<TableHandle>("table");
const controls = useTemplateRef<HTMLElement>("controls");
const scrollContainer = useTemplateRef<HTMLElement>("scrollContainer");
const tableViewport = useTemplateRef<HTMLElement>("tableViewport");
const slots = useSlots();
const tableSlots = Object.fromEntries(Object.entries(slots).filter(([name]) => !["filters", "mobile-primary", "mobile-secondary"].includes(name)));
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
const mobileHasSecondaryControls = computed(() => Boolean(props.sortingOptions.length || props.groupingOptions.length || slots["mobile-secondary"]));
const mobileExpanded = reactive<Record<string, boolean>>({});
const rowIdentity = (row: TData) => {
  const value = typeof props.rowKey === "function" ? props.rowKey(row) : row[props.rowKey];
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`AdminDataTable row key must resolve to a string or number for ${props.tableKey}`);
  return String(value);
};
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
  tableViewport.value?.scrollTo?.({ top: 0, left: 0 });
  if (boundedScroll.value) {
    scrollContainer.value?.scrollTo?.({ top: 0, left: 0 });
    return;
  }
  tableRoot.value?.scrollIntoView?.({ block: "start", inline: "nearest", behavior: "auto" });
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
    mobileControlsChangeHandler = () => { if (mobileControlsMediaQuery?.matches) secondaryControlsOpen.value = false; };
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
  <div ref="tableRoot" class="admin-data-table" :style="props.tableMinWidth ? { '--admin-table-min-width': props.tableMinWidth } : undefined">
    <div ref="scrollContainer" class="admin-data-table__scroll" :class="{ 'admin-data-table__scroll--bounded': boundedScroll }" :style="boundedScroll && tableScrollHeight ? { height: tableScrollHeight } : undefined">
      <div ref="controls" class="admin-data-table__controls scroll-edge-sticky">
        <div v-if="$slots.filters" class="admin-data-table__filters admin-data-table__filters--desktop"><slot name="filters" /></div>
        <div v-if="$slots['mobile-primary']" class="admin-data-table__mobile-primary-controls"><slot name="mobile-primary" /></div>
        <div class="admin-data-table__secondary-controls admin-data-table__secondary-controls--desktop">
          <div class="admin-data-table__secondary-controls-content">
            <div v-if="props.sortingOptions.length" class="admin-data-table__sort-control">
              <USelect v-model="sortingSelection" class="w-full" aria-label="排序方式" size="md" :items="sortingItems" :ui="{ content: 'min-w-64', itemLabel: 'whitespace-nowrap overflow-visible text-clip' }" />
            </div>
            <USelect v-if="props.groupingOptions.length" v-model="groupingSelection" aria-label="分组方式" size="md" :items="groupingItems" />
            <UDropdownMenu :items="columnMenuItems" :content="{ align: 'end' }">
              <UButton label="列" color="neutral" variant="outline" size="md" trailing-icon="i-lucide-chevron-down" />
            </UDropdownMenu>
          </div>
        </div>
        <UDrawer v-if="mobileHasSecondaryControls" v-model:open="secondaryControlsOpen" direction="bottom" title="筛选与排序" description="调整当前列表的显示顺序与筛选条件。" close :ui="{ content: 'admin-data-table__mobile-drawer glass-heavy elevation-3', header: 'glass-segment', body: 'admin-data-table__mobile-drawer-body' }">
          <UButton class="admin-data-table__mobile-controls-trigger" label="筛选与排序" color="neutral" variant="outline" size="md" icon="i-lucide-sliders-horizontal" aria-label="打开筛选与排序" />
          <template #body>
            <div class="admin-data-table__mobile-controls-content">
              <div v-if="$slots['mobile-secondary']" class="admin-data-table__mobile-secondary-filters"><slot name="mobile-secondary" /></div>
              <USelect v-if="props.sortingOptions.length" v-model="sortingSelection" aria-label="排序方式" size="md" :items="sortingItems" />
              <USelect v-if="props.groupingOptions.length" v-model="groupingSelection" aria-label="分组方式" size="md" :items="groupingItems" />
            </div>
          </template>
        </UDrawer>
      </div>
      <div ref="tableViewport" class="admin-data-table__table-viewport">
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
      </div>
      <div class="admin-data-table__mobile-list" :aria-busy="loading">
        <div v-if="loading" class="admin-data-table__mobile-loading" aria-label="正在加载"><USkeleton v-for="index in 3" :key="index" class="admin-data-table__mobile-skeleton" /></div>
        <p v-else-if="!mobileData.length" class="admin-data-table__mobile-empty">{{ empty }}</p>
        <ul v-else class="admin-data-table__mobile-records">
          <li v-for="item in mobileData" :key="rowIdentity(item)" class="admin-data-table__mobile-record">
            <NuxtLink v-if="props.mobileRowLink" class="admin-data-table__mobile-primary-link" :to="props.mobileRowLink(item)">
              <div class="admin-data-table__mobile-primary">
                <div v-for="field in mobilePrimaryColumns" :key="field.id" class="admin-data-table__mobile-field">
                  <span class="admin-data-table__mobile-label">{{ typeof field.column.header === 'string' ? field.column.header : field.id }}</span>
                  <slot v-if="tableSlots[`${field.id}-cell`]" :name="`${field.id}-cell`" :row="mobileRow(item)" />
                  <span v-else>{{ mobileValue(item, field.column) }}</span>
                </div>
              </div>
            </NuxtLink>
            <div v-else class="admin-data-table__mobile-primary">
              <div v-for="field in mobilePrimaryColumns" :key="field.id" class="admin-data-table__mobile-field">
                <span class="admin-data-table__mobile-label">{{ typeof field.column.header === 'string' ? field.column.header : field.id }}</span>
                <slot v-if="tableSlots[`${field.id}-cell`]" :name="`${field.id}-cell`" :row="mobileRow(item)" />
                <span v-else>{{ mobileValue(item, field.column) }}</span>
              </div>
            </div>
            <div v-if="mobileHasDetails" class="admin-data-table__mobile-disclosure">
              <button class="admin-data-table__mobile-disclosure-trigger" type="button" :aria-expanded="Boolean(mobileExpanded[rowIdentity(item)])" :aria-controls="`admin-table-details-${props.tableKey}-${rowIdentity(item)}`" @click="mobileExpanded[rowIdentity(item)] = !mobileExpanded[rowIdentity(item)]">
                <span>{{ mobileExpanded[rowIdentity(item)] ? '收起详情' : '查看详情' }}</span><span aria-hidden="true">⌄</span>
              </button>
              <div v-if="mobileExpanded[rowIdentity(item)]" :id="`admin-table-details-${props.tableKey}-${rowIdentity(item)}`" class="admin-data-table__mobile-details">
                <div v-for="field in mobileDetailColumns" :key="field.id" class="admin-data-table__mobile-field">
                  <span class="admin-data-table__mobile-label">{{ typeof field.column.header === 'string' ? field.column.header : field.id }}</span>
                  <slot v-if="tableSlots[`${field.id}-cell`]" :name="`${field.id}-cell`" :row="mobileRow(item)" />
                  <span v-else>{{ mobileValue(item, field.column) }}</span>
                </div>
              </div>
            </div>
            <div v-if="tableSlots['actions-cell'] && !props.mobileRowLink" class="admin-data-table__mobile-actions">
              <UDropdownMenu :items="[]" :content="{ align: 'end', side: 'bottom', sideOffset: 8, collisionPadding: 12 }" :ui="{ content: 'admin-data-table__mobile-action-menu elevation-2' }">
                <UButton icon="i-lucide-ellipsis" square color="neutral" variant="outline" class="hit-44" aria-label="打开更多操作" />
                <template #content-bottom>
                  <div class="admin-data-table__mobile-action-menu-content" role="group" aria-label="记录操作">
                    <slot name="actions-cell" :row="mobileRow(item)" />
                  </div>
                </template>
              </UDropdownMenu>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-data-table { overflow: clip; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); scroll-margin-top: var(--sticky-chrome-top, 0px); }
.admin-data-table__controls { position: sticky; z-index: 2; top: var(--sticky-chrome-top, 0px); display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; background: var(--surface); }
.admin-data-table__filters { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
.admin-data-table__mobile-primary-controls, .admin-data-table__mobile-controls-trigger { display: none; }
.admin-data-table__secondary-controls { flex: 0 1 auto; min-width: 0; }
.admin-data-table__secondary-controls-content { display: flex; align-items: center; gap: 10px; }
.admin-data-table__sort-control { flex: 0 1 16rem; min-width: 16rem; }
.admin-data-table__scroll { overflow: visible; }
/* Bounded mode owns both axes on the single virtualization scroll element; the
   table viewport must NOT become a scroll container here, or the sticky thead
   would anchor to it instead of the bounded scroller. */
.admin-data-table__scroll--bounded { display: flex; flex-direction: column; overflow: auto; overscroll-behavior: contain; }
.admin-data-table__scroll--bounded .admin-data-table__table-viewport { flex: 0 0 auto; overflow: visible; }
/* Inside the bounded scroller the controls stick to the container top rather
   than below the global header. */
.admin-data-table__scroll--bounded .admin-data-table__controls { top: 0; }
.admin-data-table__table-viewport { min-width: 0; overflow-x: auto; overflow-y: clip; }
.admin-data-table :deep(table[data-slot="base"]) { width: 100%; min-width: var(--admin-table-min-width, 0); table-layout: fixed; }
.admin-data-table :deep([data-slot="thead"]) { top: var(--admin-table-controls-height, 0px); }
.admin-data-table :deep([data-slot="th"]) { color: var(--quiet); font-size: .72rem; font-weight: 700; letter-spacing: .025em; }
.admin-data-table :deep([data-slot="th"]), .admin-data-table :deep([data-slot="td"]) { padding: 13px 14px; }
.admin-data-table :deep([data-slot="td"]) { vertical-align: middle; white-space: normal !important; }
.admin-data-table__mobile-list { display: none; }
.admin-data-table__mobile-records { margin: 0; padding: 0; list-style: none; }
.admin-data-table__mobile-record { padding: 14px; border-bottom: 1px solid var(--line); }
.admin-data-table__mobile-record:last-child { border-bottom: 0; }
.admin-data-table__mobile-primary-link { display: block; color: inherit; text-decoration: none; border-radius: 10px; }
.admin-data-table__mobile-primary-link:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
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
.admin-data-table__mobile-action-menu-content { display: grid; gap: 6px; min-width: 10rem; padding: 8px; }
.admin-data-table__mobile-action-menu-content :deep(.table-actions) { display: grid; gap: 6px; }
.admin-data-table__mobile-action-menu-content :deep(button), .admin-data-table__mobile-action-menu-content :deep(a) { min-height: 44px; }
.admin-data-table__mobile-empty { margin: 0; padding: 32px 16px; color: var(--quiet); text-align: center; }
.admin-data-table__mobile-loading { display: grid; gap: 1px; padding: 14px; }
.admin-data-table__mobile-skeleton { height: 72px; }
@media (max-width: 620px) {
  .admin-data-table { margin-inline: -2px; overflow: visible; }
  .admin-data-table__scroll--bounded { height: auto !important; max-height: none; overflow: visible; overscroll-behavior: auto; }
  .admin-data-table__controls { align-items: center; flex-wrap: wrap; justify-content: flex-start; }
  .admin-data-table__filters--desktop, .admin-data-table__secondary-controls--desktop { display: none; }
  .admin-data-table__mobile-primary-controls { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; gap: 8px; }
  .admin-data-table__mobile-primary-controls > :first-child { flex: 1 1 auto; min-width: 0; }
  .admin-data-table__mobile-controls-trigger { display: inline-flex; flex: 0 0 auto; min-height: 44px; }
  .admin-data-table__mobile-drawer { width: 100%; max-height: calc(100dvh - 1rem); border-radius: 20px 20px 0 0; }
  .admin-data-table__mobile-drawer-body { padding: 16px 16px max(16px, env(safe-area-inset-bottom)); }
  .admin-data-table__mobile-controls-content, .admin-data-table__mobile-secondary-filters { display: grid; gap: 12px; }
  .admin-data-table__mobile-secondary-filters { padding-bottom: 4px; }
  .admin-data-table__controls { position: relative; }
  .admin-data-table :deep(table[data-slot="base"]) { display: none; }
  .admin-data-table__mobile-list { display: block; }
}

@media (prefers-reduced-motion: reduce) {
  .admin-data-table__mobile-primary-link { transition: none; }
}

@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .admin-data-table__mobile-drawer { background: var(--surface); backdrop-filter: none; }
}
</style>
