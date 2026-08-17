import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import DatasetsPage from "./index.vue";

const snapshot = {
  datasetId: "00000000-0000-4000-8000-000000000007",
  version: 1,
  status: "draft",
  createdBy: "admin",
  createdAt: 1,
  finalizedBy: null,
  finalizedAt: null,
  note: null,
  counts: { eligibleCount: 2, excludedCount: 1, submissionCount: 1, annotationCount: 2 },
};
const detail = {
  contractVersion: "1",
  snapshot,
  members: [{ annotationId: "00000000-0000-4000-8000-000000000006", fieldKey: "difficulty", reviewedValue: "一般", normalizedValue: "一般", originalOcrValue: "困难", modelVersion: "ocr-v1", layoutVersion: "layout-v2", evidence: { available: true, contentType: "image/png" } }],
  exclusions: [{ annotationId: "00000000-0000-4000-8000-000000000008", reason: "missing_model_version" }],
};

const adminApi = vi.fn((path: string, options?: { method?: string }) => {
  if (path === "/v1/datasets?page=1&pageSize=20") return Promise.resolve({ items: [snapshot], total: 1 });
  if (path === "/v1/datasets/00000000-0000-4000-8000-000000000007") return Promise.resolve(detail);
  if (path === "/v1/datasets" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", datasetId: snapshot.datasetId, version: 2, status: "draft", counts: { eligibleCount: 2, excludedCount: 1, submissionCount: 1, annotationCount: 2 } });
  if (options?.method === "POST") return Promise.resolve({ contractVersion: "1", datasetId: snapshot.datasetId, version: 1, status: "finalized", finalizedAt: 2 });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

const AdminDataTableStub = defineComponent({
  props: ["data", "rowKey", "loading", "empty"],
  setup(props, { slots }) {
    return () => h("div", { class: "table-stub" }, [
      (props.data as Array<Record<string, unknown>>).map((row) => h("div", { class: "table-stub-row", key: String(row[props.rowKey as string]), "data-testid": "table-row" }, [
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
  USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  StatusBadge: { props: ["label"], template: '<span class="status-badge">{{ label }}</span>' },
};

describe("admin datasets page", () => {
  it("loads the dataset list and opens the detail dialog", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(DatasetsPage, { global: { stubs } });
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/datasets?page=1&pageSize=20");
    expect(wrapper.text()).toContain("eligibleCount");
    await wrapper.get('[data-testid="table-row"]').find("button").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/datasets/00000000-0000-4000-8000-000000000007");
    expect(wrapper.get('[data-testid="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("缺少模型版本");
    expect(wrapper.text()).toContain("定稿冻结");
  });

  it("creates a draft from eligible reviewed annotations", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(DatasetsPage, { global: { stubs } });
    await flushPromises();
    const createButton = wrapper.findAll("button").find((button) => button.text().includes("创建草稿"));
    await createButton?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/datasets", expect.objectContaining({ method: "POST", body: { contractVersion: "1" } }));
    expect(wrapper.text()).toContain("已创建 v2 草稿");
  });

  it("finalizes a draft and reports the immutable result", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(DatasetsPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[data-testid="table-row"]').find("button").trigger("click");
    await flushPromises();
    const finalizeButton = wrapper.findAll("button").find((button) => button.text().includes("定稿冻结"));
    await finalizeButton?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/datasets/00000000-0000-4000-8000-000000000007/finalize", expect.objectContaining({ method: "POST", body: { contractVersion: "1" } }));
    expect(wrapper.text()).toContain("已定稿，快照不可再变更");
  });
});
