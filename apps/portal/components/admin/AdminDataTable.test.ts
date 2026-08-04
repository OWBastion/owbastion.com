import { defineComponent, h, nextTick, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
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
  const mountTable = () => mount(AdminDataTable, {
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
    },
    slots: {
      "actions-cell": ({ row }: { row: { original: { id: string } } }) => h("button", { type: "button" }, `操作 ${row.original.id}`),
    },
    global: {
      stubs: {
        UTable: defineComponent({
          props: { data: { type: Array, default: () => [] } },
          setup(props, { expose }) {
            expose({ tableApi: { getRowModel: () => ({ rows: props.data.map((original) => ({ original })) }) } });
            return () => h("div");
          },
        }),
        UDrawer: defineComponent({ template: "<div><slot /><slot name=\"body\" /></div>" }),
        UButton: defineComponent({ template: "<button><slot /></button>" }),
        USelect: defineComponent({ template: "<select />" }),
        UDropdownMenu: defineComponent({ template: "<div><slot /><slot name=\"content-bottom\" /></div>" }),
        USkeleton: defineComponent({ template: "<div />" }),
        NuxtLink: defineComponent({ template: "<a><slot /></a>" }),
      },
    },
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
