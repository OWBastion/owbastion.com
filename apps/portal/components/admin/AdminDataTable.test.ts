import { defineComponent, h, nextTick, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTableColumnVisibility } from "~/composables/useTableColumnVisibility";
import AdminDataTable from "./AdminDataTable.vue";

const originalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");

afterEach(() => {
  if (originalStorage) Object.defineProperty(window, "localStorage", originalStorage);
});

describe("table column visibility", () => {
  it("restores and saves preferences for an individual table key", async () => {
    const values = new Map<string, string>([["owbastion:admin-table-columns:players", JSON.stringify({ updatedAt: false })]]);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    let visibility: Ref<Record<string, boolean>> | undefined;
    mount(defineComponent({
      setup() {
        visibility = useTableColumnVisibility("players");
        return () => h("div");
      },
    }));
    await nextTick();
    expect(visibility?.value).toEqual({ updatedAt: false });
    visibility!.value = { updatedAt: false, bindingCount: false };
    await nextTick();
    expect(values.get("owbastion:admin-table-columns:players")).toBe(JSON.stringify({ updatedAt: false, bindingCount: false }));
  });
});

describe("AdminDataTable mobile presentation", () => {
  const rows = [
    { id: "record-a", name: "第一条", status: "待处理" },
    { id: "record-b", name: "第二条", status: "已完成" },
  ];
  const columns = [
    { accessorKey: "name", header: "记录" },
    { accessorKey: "status", header: "状态" },
    { id: "actions", header: "操作", enableHiding: false },
  ];
  const createTableStub = (onProps?: (value: { virtualize: unknown; sticky: unknown; columns: unknown }) => void) => defineComponent({
    props: {
      data: { type: Array, default: () => [] },
      columns: { type: Array, default: () => [] },
      virtualize: { default: false },
      sticky: { default: false },
    },
    setup(props, { expose }) {
      onProps?.({ virtualize: props.virtualize, sticky: props.sticky, columns: props.columns });
      expose({ tableApi: { getRowModel: () => ({ rows: props.data.map((original) => ({ original })) }) } });
      return () => h("div");
    },
  });
  const mountTable = (extraProps: Record<string, unknown> = {}, onProps?: (value: { virtualize: unknown; sticky: unknown; columns: unknown }) => void) => mount(AdminDataTable, {
    props: {
      data: rows,
      columns,
      empty: "暂无记录。",
      tableKey: "mobile-test",
      rowKey: "id",
      mobileColumns: [
        { id: "name", priority: "primary", order: 0 },
        { id: "status", priority: "detail", order: 1 },
      ],
      sortingOptions: [{ id: "name", label: "记录" }],
      ...extraProps,
    },
    slots: {
      "actions-cell": ({ row }: { row: { original: { id: string } } }) => h("button", { type: "button" }, `操作 ${row.original.id}`),
    },
    global: {
      stubs: {
        UTable: createTableStub(onProps),
        UDrawer: defineComponent({ template: "<div><slot /><slot name=\"body\" /></div>" }),
        UButton: defineComponent({ template: "<button><slot /></button>" }),
        USelect: defineComponent({ template: "<select />" }),
        UDropdownMenu: defineComponent({ template: "<div><slot /><slot name=\"content-bottom\" /></div>" }),
        USkeleton: defineComponent({ template: "<div />" }),
        NuxtLink: defineComponent({ template: "<a><slot /></a>" }),
      },
    },
  });

  it("uses document flow by default and keeps controls before the table", () => {
    const wrapper = mountTable();
    const scroll = wrapper.get(".admin-data-table__scroll");
    const controls = wrapper.get(".admin-data-table__controls").element;
    const tableViewport = wrapper.get(".admin-data-table__table-viewport").element;

    expect(scroll.classes()).not.toContain("admin-data-table__scroll--bounded");
    expect(scroll.element.style.height).toBe("");
    expect(controls.compareDocumentPosition(tableViewport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps explicit bounded mode and virtualization on the same scroll element", async () => {
    let virtualize: unknown;
    const wrapper = mountTable({ scrollHeight: "30rem", virtualize: { estimateSize: 65, overscan: 8 } }, (props) => { virtualize = props.virtualize; });
    await nextTick();
    const scroll = wrapper.get(".admin-data-table__scroll");

    expect(scroll.classes()).toContain("admin-data-table__scroll--bounded");
    expect(scroll.attributes("style")).toContain("height: 30rem");
    expect(virtualize).toEqual(expect.objectContaining({ estimateSize: 65, overscan: 8 }));
    expect((virtualize as { getScrollElement: () => HTMLElement | null }).getScrollElement()).toBe(scroll.element);
  });

  it("disables header sorting unless the page opts in with sortingOptions", async () => {
    let unsortedColumns: Array<{ enableSorting?: boolean; id?: string; accessorKey?: string }> | undefined;
    mountTable({ sortingOptions: [] }, (props) => { unsortedColumns = props.columns as typeof unsortedColumns; });
    await nextTick();
    expect(unsortedColumns?.every((column) => column.enableSorting === false)).toBe(true);

    let sortedColumns: Array<{ enableSorting?: boolean; accessorKey?: string; id?: string }> | undefined;
    mountTable({ sortingOptions: [{ id: "name", label: "记录" }] }, (props) => { sortedColumns = props.columns as typeof sortedColumns; });
    await nextTick();
    expect(sortedColumns?.find((column) => column.accessorKey === "name")?.enableSorting).toBe(true);
    expect(sortedColumns?.find((column) => column.id === "actions")?.enableSorting).toBe(false);
  });

  it("keeps sticky table headers enabled by default in flow and bounded modes", async () => {
    let flowProps: { virtualize: unknown; sticky: unknown } | undefined;
    mountTable({}, (props) => { flowProps = props; });
    await nextTick();
    expect(flowProps?.sticky).toBe("header");

    let boundedProps: { virtualize: unknown; sticky: unknown } | undefined;
    mountTable({ scrollHeight: "30rem" }, (props) => { boundedProps = props; });
    await nextTick();
    expect(boundedProps?.sticky).toBe("header");
  });

  it("does not create a horizontal scrollport on the table viewport by default", () => {
    const wrapper = mountTable();
    const viewport = wrapper.get(".admin-data-table__table-viewport");
    expect(viewport.classes()).not.toContain("admin-data-table__table-viewport--x");
  });

  it("returns flow resets to the workspace start and bounded resets its internal scroll", async () => {
    const flow = mountTable();
    const flowRoot = flow.get(".admin-data-table").element;
    const flowViewport = flow.get(".admin-data-table__table-viewport").element;
    const flowScrollIntoView = vi.fn();
    const flowHorizontalScroll = vi.fn();
    Object.defineProperty(flowRoot, "scrollIntoView", { configurable: true, value: flowScrollIntoView });
    Object.defineProperty(flowViewport, "scrollTo", { configurable: true, value: flowHorizontalScroll });

    await flow.setProps({ resetScrollKey: "next-page" });
    await nextTick();

    expect(flowHorizontalScroll).toHaveBeenCalledWith({ top: 0, left: 0 });
    expect(flowScrollIntoView).toHaveBeenCalledWith({ block: "start", inline: "nearest", behavior: "auto" });

    const bounded = mountTable({ scrollHeight: "30rem" });
    const boundedScroll = bounded.get(".admin-data-table__scroll").element;
    const boundedScrollTo = vi.fn();
    Object.defineProperty(boundedScroll, "scrollTo", { configurable: true, value: boundedScrollTo });

    await bounded.setProps({ resetScrollKey: "next-page" });
    await nextTick();

    expect(boundedScrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
  });

  it("renders stable record ids, mobile control disclosure, and an overflow action trigger", async () => {
    const wrapper = mountTable();
    await nextTick();

    expect(wrapper.findAll(".admin-data-table__mobile-record")).toHaveLength(2);
    expect(wrapper.findAll(".admin-data-table__mobile-disclosure-trigger")).toHaveLength(2);
    expect(wrapper.get(".admin-data-table__mobile-controls-trigger").attributes("aria-label")).toBe("打开筛选与排序");
    expect(wrapper.findAll(".hit-44")).toHaveLength(2);

    await wrapper.get(".admin-data-table__mobile-disclosure-trigger").trigger("click");
    expect(wrapper.get(".admin-data-table__mobile-disclosure-trigger").attributes("aria-expanded")).toBe("true");
  });
});
