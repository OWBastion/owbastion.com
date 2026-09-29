import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import ScreenshotSetsPage from "./index.vue";

const set = {
  setId: "00000000-0000-4000-8000-000000000007",
  version: 1,
  status: "draft",
  createdBy: "admin",
  createdAt: 1,
  finalizedBy: null,
  finalizedAt: null,
  discardedBy: null,
  discardedAt: null,
  note: null,
  counts: { memberCount: 2, excludedCount: 1 },
};
const detail = {
  contractVersion: "1",
  set,
  members: [{ sourceId: "00000000-0000-4000-8000-000000000006", submissionId: "00000000-0000-4000-8000-000000000011", mapName: "萨摩亚", objectKey: "uploads/submissions/sub/object.png", sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 12, layoutVersion: "layout-v2", accuracy: "inaccurate", evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/sub/object.png" }],
  exclusions: [{ sourceId: null, submissionId: "00000000-0000-4000-8000-000000000013", reason: "missing_evidence" }],
};
const candidate = {
  sourceId: "00000000-0000-4000-8000-000000000006",
  submissionId: "00000000-0000-4000-8000-000000000011",
  mapName: "萨摩亚",
  submissionStatus: "rejected",
  accuracy: "inaccurate",
  layoutVersion: "layout-v2",
  mimeType: "image/png",
  sizeBytes: 12,
  evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/sub/object.png",
};

const adminApi = vi.fn((path: string, options?: { method?: string }) => {
  if (path === "/v1/screenshot-sets?page=1&pageSize=20") return Promise.resolve({ items: [set], total: 1 });
  if (path === "/v1/screenshot-sets/candidates?page=1&pageSize=100") return Promise.resolve({ items: [candidate], total: 1, hasMore: false });
  if (path === "/v1/screenshot-sets/00000000-0000-4000-8000-000000000007") return Promise.resolve(detail);
  if (path === "/v1/screenshot-sets" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", setId: set.setId, version: 2, status: "draft", counts: { memberCount: 0, excludedCount: 1 } });
  if (path === "/v1/screenshot-sets/00000000-0000-4000-8000-000000000007/finalize" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", setId: set.setId, version: 1, status: "finalized", finalizedAt: 2 });
  if (path === "/v1/screenshot-sets/00000000-0000-4000-8000-000000000007/discard" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", setId: set.setId, version: 1, status: "discarded", discardedAt: 3 });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: vi.fn() }));

const AdminDataTableStub = defineComponent({
  props: ["data", "rowKey", "loading", "empty"],
  setup(props, { slots }) {
    return () => h("div", { role: "table" }, [
      (props.data as Array<Record<string, unknown>>).map((row) => h("div", { role: "row", key: String(row[props.rowKey as string]) }, [
        JSON.stringify(row),
        slots["actions-cell"] ? slots["actions-cell"]({ row: { original: row } }) : null,
      ])),
    ]);
  },
});
const AdminResponsiveDialogStub = defineComponent({
  props: ["open", "title"],
  setup(props, { slots }) {
    return () => (props.open ? h("div", { role: "dialog" }, [h("h2", props.title), slots.body?.(), slots.footer?.(), slots.default?.()]) : null);
  },
});
const stubs = {
  AdminDataTable: AdminDataTableStub,
  AdminResponsiveDialog: AdminResponsiveDialogStub,
  USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  StatusBadge: { props: ["label"], template: '<span class="status-badge">{{ label }}</span>' },
};

describe("admin screenshot sets page", () => {
  it("loads the set list and opens the detail dialog", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ScreenshotSetsPage, { global: { stubs } });
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/screenshot-sets?page=1&pageSize=20");
    expect(wrapper.text()).toContain("memberCount");
    await wrapper.get('[role="row"]').find("button").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/screenshot-sets/00000000-0000-4000-8000-000000000007");
    expect(wrapper.get('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("缺少已保存截图");
    expect(wrapper.text()).toContain("定稿");
  });

  it("lets maintainers exclude an anomaly while creating a draft", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ScreenshotSetsPage, { global: { stubs } });
    await flushPromises();
    const createButton = wrapper.findAll("button").find((button) => button.text().includes("创建截图集"));
    await createButton?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/screenshot-sets/candidates?page=1&pageSize=100");
    await wrapper.get('.set-candidate input[type="checkbox"]').setValue(true);
    await wrapper.get('[role="dialog"]').findAll("button").find((button) => button.text().trim() === "创建草稿")?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/screenshot-sets", expect.objectContaining({ method: "POST", body: { contractVersion: "1", excludedSourceIds: ["00000000-0000-4000-8000-000000000006"] } }));
  });

  it("finalizes a draft and reports the immutable result", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ScreenshotSetsPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[role="row"]').find("button").trigger("click");
    await flushPromises();
    const finalizeButton = wrapper.findAll("button").find((button) => button.text().trim() === "定稿");
    await finalizeButton?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/screenshot-sets/00000000-0000-4000-8000-000000000007/finalize", expect.objectContaining({ method: "POST", body: { contractVersion: "1" } }));
  });

  it("discards a draft only after confirmation", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ScreenshotSetsPage, { global: { stubs } });
    await flushPromises();
    await wrapper.get('[role="row"]').find("button").trigger("click");
    await flushPromises();

    // The discard button opens a confirmation instead of posting immediately.
    const discardButton = wrapper.findAll("button").find((button) => button.text().trim() === "废弃");
    await discardButton?.trigger("click");
    await flushPromises();
    expect(adminApi).not.toHaveBeenCalledWith(expect.stringContaining("/discard"), expect.anything());
    expect(wrapper.text()).toContain("确认废弃截图集");

    const confirmButton = wrapper.findAll("button").find((button) => button.text().trim() === "确认废弃");
    await confirmButton?.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/screenshot-sets/00000000-0000-4000-8000-000000000007/discard", expect.objectContaining({ method: "POST", body: { contractVersion: "1" } }));
  });
});
