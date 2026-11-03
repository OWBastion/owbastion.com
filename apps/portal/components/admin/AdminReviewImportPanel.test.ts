import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminReviewImportPanel from "./AdminReviewImportPanel.vue";

const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
const twins = [
  { eventId: "event.early", name: "我独自闯关", releaseStatus: "removed", gameVersion: "3.0" },
  { eventId: "event.late", name: "我独自闯关", releaseStatus: "removed", gameVersion: "5.0" },
];
const preview = (resolved: boolean) => ({ contractVersion: "1", sourceHash: "h", rowCount: 1, importCount: resolved ? 1 : 0, errors: [], unresolved: resolved ? [] : [{ name: "我独自闯关", rowCount: 1, candidates: twins }] });

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
mockNuxtImport("useAdminApi", () => () => api);

describe("review import panel", () => {
  it("lets the maintainer choose the event for an ambiguous name, then imports with that choice", async () => {
    api.mockImplementation(async (path: string, options?: { body?: Record<string, unknown> }) => {
      calls.push({ path, body: options?.body ?? {} });
      if (path.endsWith("/preview")) return preview(Boolean((options?.body?.resolutions as Record<string, string>)?.["我独自闯关"]));
      return { contractVersion: "1", importedCount: 1 };
    });
    const fileUpload = { name: "UFileUpload", props: ["modelValue"], emits: ["update:modelValue"], template: "<div />" };
    const wrapper = await mountSuspended(AdminReviewImportPanel, { global: { stubs: { UFileUpload: fileUpload } } });
    wrapper.findComponent({ name: "UFileUpload" }).vm.$emit("update:modelValue", new File(["ID,提交时间,提交人,评分事件,评分,评论\n1,2026/04/03,访客,我独自闯关,5,"], "survey.csv"));
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "预检")!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("「我独自闯关」1 行");
    expect(wrapper.findAll("button").some((button) => button.text() === "确认导入")).toBe(false);
    wrapper.findComponent({ name: "USelectMenu" }).vm.$emit("update:modelValue", "event.early");
    await flushPromises();

    expect(calls.at(-1)).toMatchObject({ path: "/v1/reviews/imports/preview", body: { resolutions: { 我独自闯关: "event.early" } } });
    await wrapper.findAll("button").find((button) => button.text() === "确认导入")!.trigger("click");
    await flushPromises();
    expect(calls.at(-1)).toMatchObject({ path: "/v1/reviews/imports", body: { resolutions: { 我独自闯关: "event.early" } } });
    expect(wrapper.emitted("imported")).toEqual([[1]]);
  });
});
