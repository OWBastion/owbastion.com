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
  const createTableStub = () => defineComponent({
    props: {
      data: { type: Array, default: () => [] },
      columns: { type: Array, default: () => [] },
    },
    setup(props, { expose }) {
      expose({ tableApi: { getRowModel: () => ({ rows: props.data.map((original) => ({ original })) }) } });
      return () => h("div");
    },
  });
  const mountTable = (extraProps: Record<string, unknown> = {}) => mount(AdminDataTable, {
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
        UTable: createTableStub(),
        UDrawer: defineComponent({ template: "<div><slot /><slot name=\"body\" /></div>" }),
        UButton: defineComponent({ props: ["label"], template: "<button><slot />{{ label }}</button>" }),
        USelect: defineComponent({
          props: ["modelValue", "items"],
          emits: ["update:modelValue"],
          template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
        }),
        UDropdownMenu: defineComponent({ template: "<div><slot /><slot name=\"content-bottom\" /></div>" }),
        USkeleton: defineComponent({ template: "<div />" }),
        NuxtLink: defineComponent({ props: ["to"], template: '<a :href="to"><slot /></a>' }),
      },
    },
  });

  it("shows row details on demand and links each record to its destination", async () => {
    const wrapper = mountTable({ mobileRowLink: (row: { id: string }) => `/admin/records/${row.id}` });
    const recordLink = wrapper.get('a[href="/admin/records/record-a"]');
    expect(recordLink.text()).toContain("第一条");
    expect(wrapper.text()).not.toContain("待处理");

    const disclosure = wrapper.findAll("button").find((button) => button.text().includes("查看详情"))!;
    expect(disclosure.text()).toContain("查看详情");
    await disclosure.trigger("click");
    expect(disclosure.attributes("aria-expanded")).toBe("true");
    expect(wrapper.text()).toContain("待处理");
  });

  it("selects records with checkboxes on the mobile list and reports their keys", async () => {
    const wrapper = mountTable({ selectable: true, selectedKeys: [], "onUpdate:selectedKeys": (keys: string[]) => wrapper.setProps({ selectedKeys: keys }) });
    const boxes = wrapper.findAll('[aria-label="选择此记录"]');
    expect(boxes).toHaveLength(2);

    await boxes[1]!.trigger("click");
    expect(wrapper.emitted("update:selectedKeys")?.at(-1)).toEqual([["record-b"]]);
  });

  it("hides desktop row clicks from the mobile action when the table is in master mode", async () => {
    const picked: string[] = [];
    const wrapper = mountTable({ activeRowKey: null, mobileRowAction: (row: { id: string }) => picked.push(row.id) });
    await wrapper.findAll(".admin-data-table__mobile-primary-link")[0]!.trigger("click");
    expect(picked).toEqual(["record-a"]);
  });

  it("shows the secondary-control entry point when sorting is available", async () => {
    const wrapper = mountTable();
    await nextTick();

    expect(wrapper.get('button[aria-label="打开筛选与排序"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("第一条");
    expect(wrapper.text()).toContain("第二条");
  });

  it("lets the user choose an available record ordering", async () => {
    const wrapper = mountTable();
    const sorting = wrapper.get('select[aria-label="排序方式"]');

    expect(sorting.text()).toContain("记录：升序");
    expect(sorting.text()).toContain("记录：降序");
    await sorting.setValue("name:desc");

    expect(wrapper.emitted("update:sorting")).toEqual([[ [{ id: "name", desc: true }] ]]);
  });

  it("announces loading while records are being refreshed", () => {
    const idle = mountTable();
    expect(idle.find('[role="status"][aria-label="正在加载"]').exists()).toBe(false);

    const loading = mountTable({ loading: true });
    expect(loading.find('[role="status"][aria-label="正在加载"]').exists()).toBe(true);
  });
});
