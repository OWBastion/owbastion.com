import { afterEach, describe, expect, it, vi } from "vitest";
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
    const revoke = vi.fn();
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
          h("div", [
            h("button", { type: "button" }, `操作 ${row.original.id}`),
            h("button", { type: "button", onClick: revoke }, "撤销"),
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
    return { wrapper, revoke };
  };

  it("lets the user open a record's actions and run one", async () => {
    const { revoke } = await mountTable();
    const trigger = wrapper!.get('button[aria-label="打开更多操作"]');

    await trigger.trigger("click");
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const action = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "撤销");
    expect(action).toBeTruthy();
    action!.click();
    expect(revoke).toHaveBeenCalledOnce();
  });
});
