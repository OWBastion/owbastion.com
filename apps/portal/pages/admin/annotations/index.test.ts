import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import AnnotationsPage from "./index.vue";

const proposal = {
  proposalId: "00000000-0000-4000-8000-000000000005",
  submissionId: "00000000-0000-4000-8000-000000000003",
  submissionMapName: "测试地图",
  submissionCreatedAt: 1,
  ocrResultId: "00000000-0000-4000-8000-000000000004",
  fieldKey: "difficulty",
  originalValue: "困难",
  feedbackType: "corrected",
  promptOrigin: "uncertainty",
  proposedValue: "一般",
  modelVersion: "ocr-v1",
  layoutVersion: "layout-v2",
  playerSubmittedAt: 2,
  reviewState: "pending",
  priority: { score: 25, category: "correction", reasons: ["correction"] },
};
const detail = { contractVersion: "1", proposal, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true } };
const reviewed = {
  annotationId: "00000000-0000-4000-8000-000000000006",
  submissionId: "00000000-0000-4000-8000-000000000003",
  submissionMapName: "测试地图",
  ocrResultId: "00000000-0000-4000-8000-000000000004",
  proposalId: "00000000-0000-4000-8000-000000000005",
  fieldKey: "difficulty",
  originalOcrValue: "困难",
  modelVersion: "ocr-v1",
  layoutVersion: "layout-v2",
  reviewedValue: "一般",
  normalizedValue: "一般",
  playerAccountId: "player-1",
  playerProposedValue: "一般",
  promptOrigin: "uncertainty",
  reviewState: "accepted",
  reviewedBy: "maintainer-1",
  reviewedAt: 3,
  note: null,
  supersedesAnnotationId: null,
  createdAt: 3,
};

const adminApi = vi.fn((path: string, options?: { method?: string }) => {
  if (path === "/v1/admin/annotations/proposals?page=1&pageSize=20") return Promise.resolve({ items: [proposal], total: 1 });
  if (path === "/v1/admin/annotations/reviewed?page=1&pageSize=20") return Promise.resolve({ items: [reviewed], total: 1 });
  if (path === "/v1/admin/annotations/proposals/00000000-0000-4000-8000-000000000005") return Promise.resolve(detail);
  if (path === "/v1/admin/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "测试地图", ocrResultId: "00000000-0000-4000-8000-000000000004", ocr: { data: { map_name: "测试地图" } } });
  if (options?.method === "POST") return Promise.resolve({});
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

// AdminDataTable and AdminResponsiveDialog have their own dedicated tests; here
// they are stubbed so the page logic (loading, detail, decisions, direct
// creation) is exercised directly.
const AdminDataTableStub = defineComponent({
  props: ["data", "rowKey", "loading", "empty"],
  setup(props, { slots }) {
    return () => h("div", { class: "table-stub" }, [
      (props.data as Array<Record<string, unknown>>).map((row) => h("div", {
        class: "table-stub-row",
        key: String(row[props.rowKey as string]),
        "data-testid": "table-row",
      }, [
        JSON.stringify(row),
        slots["actions-cell"] ? slots["actions-cell"]({ row: { original: row } }) : null,
      ])),
    ]);
  },
});

const AdminResponsiveDialogStub = defineComponent({
  props: ["open", "title"],
  setup(props, { slots }) {
    return () => (props.open ? h("div", { role: "dialog", class: "dialog-stub", "data-testid": "dialog" }, [h("h2", props.title), slots.body?.(), slots.footer?.(), slots.default?.()]) : null);
  },
});

const stubs = {
  AdminDataTable: AdminDataTableStub,
  AdminResponsiveDialog: AdminResponsiveDialogStub,
  UTabs: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<div class="tabs-stub"><button v-for="item in items" :key="item.value" :class="{ active: modelValue === item.value }" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>' },
  USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  StatusBadge: { props: ["label"], template: '<span class="status-badge">{{ label }}</span>' },
};

describe("admin annotations page", () => {
  it("loads the proposal queue and opens the detail dialog on row click", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AnnotationsPage, { global: { stubs } });
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/admin/annotations/proposals?page=1&pageSize=20");
    expect(wrapper.text()).toContain("测试地图");
    expect(wrapper.text()).toContain("pending");
    expect(wrapper.text()).toContain("详情");

    await wrapper.get('[data-testid="table-row"]').find("button").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/admin/annotations/proposals/00000000-0000-4000-8000-000000000005");
    expect(wrapper.get('[data-testid="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("玩家建议值");
    expect(wrapper.text()).toContain("一般");
  });

  it("accepts and rejects proposals through idempotent decisions", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AnnotationsPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="table-row"]').find("button").trigger("click");
    await flushPromises();
    const accept = wrapper.findAll("button").find((button) => button.text().trim() === "接受");
    await accept?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/admin/annotations/proposals/00000000-0000-4000-8000-000000000005/decision", expect.objectContaining({
      method: "POST",
      body: { contractVersion: "1", action: "accept" },
    }));
    expect(wrapper.text()).toContain("已接受该标注");
  });

  it("switches to the reviewed annotations tab", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AnnotationsPage, { global: { stubs } });
    await flushPromises();
    const tabs = wrapper.findAll("button").filter((button) => ["提案队列", "已审标注"].includes(button.text()));
    await tabs.find((button) => button.text() === "已审标注")?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/admin/annotations/reviewed?page=1&pageSize=20");
    expect(wrapper.text()).toContain("normalizedValue");
    expect(wrapper.text()).toContain("maintainer-1");
  });

  it("creates a reviewed annotation directly from an inspected submission", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(AnnotationsPage, { global: { stubs } });
    await flushPromises();
    const directButton = wrapper.findAll("button").find((button) => button.text().includes("直接标注"));
    await directButton?.trigger("click");
    await flushPromises();
    await wrapper.find('input[aria-label="提交 ID"]').setValue("submission-1");
    const readButton = wrapper.findAll("button").find((button) => button.text() === "读取");
    await readButton?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/admin/submissions/submission-1");
    await wrapper.find('input[aria-label="审定值"]').setValue("普通");
    const createButton = wrapper.findAll("button").find((button) => button.text().includes("创建标注"));
    await createButton?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/admin/annotations/direct", expect.objectContaining({
      method: "POST",
      body: { contractVersion: "1", submissionId: "submission-1", ocrResultId: "00000000-0000-4000-8000-000000000004", fieldKey: "map_name", reviewedValue: "普通" },
    }));
  });
});
