import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import OcrFeedbackPanel from "./OcrFeedbackPanel.vue";

const api = vi.fn();
mockNuxtImport("usePortalApi", () => () => api);

const feedback = (overrides: Record<string, unknown> = {}) => ({
  ocrResultId: "00000000-0000-4000-8000-000000000004",
  accuracy: null,
  ...overrides,
});

const global = {
  stubs: {
    UCard: { template: "<section><slot name=\"header\" /><slot /></section>" },
    UAlert: { props: ["description", "title", "color"], template: "<div role=\"alert\">{{ title }}{{ description }}</div>" },
    UButton: { props: ["label", "loading", "disabled"], emits: ["click"], template: "<button :disabled=\"disabled || loading\" @click=\"$emit('click')\">{{ label }}</button>" },
    UIcon: { props: ["name"], template: "<span>{{ name }}</span>" },
  },
};

const successResponse = { contractVersion: "1", submissionId: "submission-1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate", alreadySubmitted: false };

describe("OcrFeedbackPanel", () => {
  it("renders accurate/inaccurate controls without transcription inputs", async () => {
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("识别准确");
    expect(wrapper.text()).toContain("识别有误");
    expect(wrapper.findAll("input").length).toBe(0);
    expect(wrapper.findAll("select").length).toBe(0);
  });

  it("submits an accurate mark bound to the current OCR result", async () => {
    api.mockResolvedValue(successResponse);
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text().includes("识别准确"))?.trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/v1/me/submissions/submission-1/ocr-feedback", expect.objectContaining({
      method: "POST",
      body: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" },
    }));
    expect(wrapper.emitted("recorded")).toBeTruthy();
  });

  it("submits an inaccurate mark", async () => {
    api.mockResolvedValue({ ...successResponse, accuracy: "inaccurate" });
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text().includes("识别有误"))?.trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/v1/me/submissions/submission-1/ocr-feedback", expect.objectContaining({
      body: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate" },
    }));
  });

  it("does not resubmit when clicking the already-current mark", async () => {
    api.mockClear();
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback({ accuracy: "accurate" }) }, global });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("识别准确");
    await wrapper.findAll("button").find((button) => button.text().includes("识别准确"))?.trigger("click");
    await flushPromises();
    expect(api).not.toHaveBeenCalled();
  });

  it("shows a recorded message after a successful mark", async () => {
    api.mockResolvedValue(successResponse);
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text().includes("识别准确"))?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("已记录标记");
  });

  it("emits stale when the OCR result is no longer current", async () => {
    api.mockRejectedValue(Object.assign(new Error("stale"), { data: { error: { code: "OCR_PROMPT_STALE", message: "stale" } } }));
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text().includes("识别准确"))?.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("stale")).toBeTruthy();
    expect(wrapper.emitted("recorded")).toBeFalsy();
  });

  it("surfaces a generic failure without marking recorded", async () => {
    api.mockRejectedValue(Object.assign(new Error("boom"), { data: { error: { code: "INTERNAL", message: "boom" } } }));
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text().includes("识别有误"))?.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("recorded")).toBeFalsy();
    expect(wrapper.emitted("stale")).toBeFalsy();
  });
});
