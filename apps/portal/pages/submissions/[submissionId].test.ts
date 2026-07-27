import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SubmissionPage from "./[submissionId].vue";

const api = vi.fn(() => Promise.resolve({ submissionId: "submission-1", status: "resubmission_required", mapName: "帕拉伊苏", difficulty: "困难", reason: "OCR 结果与目标挑战不匹配", createdAt: 0, updatedAt: 1, ocr: { mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", challengeCompleted: true } }));
mockNuxtImport("usePortalApi", () => () => api);

describe("submission detail page", () => {
  it("shows private evidence, OCR summary, and refreshes the detail", async () => {
    api.mockClear();
    const wrapper = await mountSuspended(SubmissionPage, { route: "/submissions/submission-1", global: { stubs: { StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" } } } });
    await flushPromises();
    expect(wrapper.text()).toContain("需要重新提交");
    expect(wrapper.text()).toContain("OCR 结果与目标挑战不匹配");
    expect(wrapper.text()).toContain("识别摘要");
    expect(wrapper.findAll(".detail-grid > div").map((column) => column.classes())).toEqual([["evidence-col"], ["info-col"]]);
    expect(wrapper.get(".evidence-frame").exists()).toBe(true);
    expect(wrapper.get(".evidence-image").attributes("src")).toBe("/api/portal/submissions/submission-1/evidence");
    await wrapper.get(".evidence-image").trigger("error");
    expect(wrapper.text()).toContain("暂无截图。");
    const requestCount = api.mock.calls.length;
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledTimes(requestCount + 1);
  });
});
