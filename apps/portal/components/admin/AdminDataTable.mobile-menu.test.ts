import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, h } from "vue";
import AdminDataTable from "./AdminDataTable.vue";

describe("AdminDataTable mobile action menu", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  const mountTable = async () => {
    wrapper = mount(AdminDataTable, {
      props: {
        data: [{ id: "record-a", name: "第一条", status: "待处理" }],
        columns: [
          { accessorKey: "name", header: "记录" },
          { accessorKey: "status", header: "状态" },
          { id: "actions", header: "操作", enableHiding: false },
        ],
        mobileColumns: [
          { id: "name", priority: "primary", order: 0 },
          { id: "status", priority: "detail", order: 1 },
        ],
        empty: "暂无记录。",
        tableKey: "mobile-menu",
        rowKey: "id",
      },
      slots: {
        "actions-cell": ({ row }: { row: { original: { id: string } } }) =>
          h("div", { class: "table-actions" }, [
            h("button", { type: "button" }, `操作 ${row.original.id}`),
            h("button", { type: "button" }, "撤销"),
          ]),
      },
      global: {
        stubs: {
          USkeleton: { template: "<div />" },
          UDrawer: { template: "<div><slot /><slot name=\"body\" /></div>" },
        },
      },
      attachTo: document.body,
    });
    await nextTick();
    return wrapper;
  };

  it("opens the action menu with the actions as the only visible content", async () => {
    await mountTable();
    const trigger = wrapper!.find(".admin-data-table__mobile-actions button");
    expect(trigger.attributes("aria-label")).toBe("打开更多操作");

    await trigger.trigger("click");
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const content = Array.from(document.querySelectorAll('[data-slot="content"]'))
      .find((el) => el.textContent?.includes("撤销"));
    expect(content).toBeTruthy();
    expect(content!.querySelector(".admin-data-table__mobile-action-menu-content")).toBeTruthy();
    expect(content!.querySelector('[data-slot="viewport"]')).toBeTruthy();
    expect(content!.textContent).toContain("操作 record-a");
  });
});
