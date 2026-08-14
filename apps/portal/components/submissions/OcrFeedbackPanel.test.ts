import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import OcrFeedbackPanel from "./OcrFeedbackPanel.vue";

const api = vi.fn();
mockNuxtImport("usePortalApi", () => () => api);

const feedback = (overrides: Record<string, unknown> = {}) => ({
  mode: "targeted",
  promptOrigin: "uncertainty",
  promptFieldKeys: ["difficulty"],
  fields: [
    { key: "map_name", value: "萨摩亚" },
    { key: "difficulty", value: "困难" },
    { key: "viewer_player", value: "Player" },
    { key: "challenge_completed", value: "true" },
    { key: "achievement_titles", value: "征服者" },
  ],
  ocrResultId: "00000000-0000-4000-8000-000000000004",
  submitted: false,
  available: true,
  ...overrides,
});

const global = {
  stubs: {
    UCard: { template: "<section><slot name=\"header\" /><slot /></section>" },
    UAlert: { props: ["description", "title", "color"], template: "<div role=\"alert\">{{ title }}{{ description }}</div>" },
    UInput: { props: ["modelValue", "placeholder", "disabled"], emits: ["update:modelValue"], template: "<input :value=\"modelValue\" :placeholder=\"placeholder\" :disabled=\"disabled\" @input=\"$emit('update:modelValue', $event.target.value)\" />" },
    USelect: { props: ["modelValue", "items", "disabled"], emits: ["update:modelValue"], template: "<select :disabled=\"disabled\" @change=\"$emit('update:modelValue', $event.target.value)\"><option v-for=\"item in items\" :key=\"item.value\" :value=\"item.value\">{{ item.label }}</option></select>" },
    UButton: { props: ["label", "loading", "disabled"], emits: ["click"], template: "<button :disabled=\"disabled || loading\" @click=\"$emit('click')\">{{ label }}</button>" },
    UIcon: { props: ["name"], template: "<span>{{ name }}</span>" },
  },
};

const successResponse = { contractVersion: "1", submissionId: "submission-1", recorded: [{ fieldKey: "difficulty", action: "confirmed", status: "submitted" }], alreadySubmitted: false };

describe("OcrFeedbackPanel", () => {
  it("renders only prompted fields in targeted mode with confirm and correction actions", async () => {
    api.mockResolvedValue(successResponse);
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    const rows = wrapper.findAll(".feedback-row");
    expect(rows.length).toBe(1);
    expect(wrapper.text()).toContain("难度");
    expect(wrapper.text()).not.toContain("地图识别");
    expect(wrapper.text()).toContain("确认无误");
  });

  it("submits a confirmation for the prompted field only", async () => {
    api.mockResolvedValue(successResponse);
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text().includes("确认无误"))?.trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/v1/me/submissions/submission-1/ocr-feedback", expect.objectContaining({
      method: "POST",
      body: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "difficulty", action: "confirmed" }] },
    }));
  });

  it("submits a correction with the proposed visible value", async () => {
    api.mockResolvedValue({ ...successResponse, recorded: [{ fieldKey: "difficulty", action: "corrected", status: "submitted" }] });
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.find("input[placeholder*=\"修正\"]").setValue("一般");
    await wrapper.findAll("button").find((button) => button.text().includes("提交修正"))?.trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/v1/me/submissions/submission-1/ocr-feedback", expect.objectContaining({
      body: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] },
    }));
  });

  it("submits a grouped confirmation for every prompted field", async () => {
    api.mockResolvedValue(successResponse);
    const wrapper = await mountSuspended(OcrFeedbackPanel, {
      props: { submissionId: "submission-1", feedback: feedback({ mode: "grouped", promptOrigin: "grouped", promptFieldKeys: ["difficulty", "viewer_player", "challenge_completed"] }) },
      global,
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".feedback-row").length).toBe(3);
    await wrapper.findAll("button").find((button) => button.text().includes("全部确认无误"))?.trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/v1/me/submissions/submission-1/ocr-feedback", expect.objectContaining({
      body: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [
        { fieldKey: "difficulty", action: "confirmed" },
        { fieldKey: "viewer_player", action: "confirmed" },
        { fieldKey: "challenge_completed", action: "confirmed" },
      ] },
    }));
  });

  it("keeps a passive correction entry available when no prompt was generated", async () => {
    api.mockResolvedValue({ ...successResponse, recorded: [{ fieldKey: "difficulty", action: "corrected", status: "submitted" }] });
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback({ mode: "none", promptOrigin: null, promptFieldKeys: [] }) }, global });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("确认无误");
    expect(wrapper.findAll("button").some((button) => button.text().includes("识别有误"))).toBe(true);
    await wrapper.findAll("button").find((button) => button.text().includes("识别有误"))?.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find("input[placeholder*=\"实际显示\"]").setValue("普通");
    await wrapper.findAll("button").find((button) => button.text() === "提交")?.trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/v1/me/submissions/submission-1/ocr-feedback", expect.objectContaining({
      body: { contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "map_name", action: "corrected", proposedValue: "普通" }] },
    }));
  });

  it("shows a recorded state without a confirmation form after feedback was submitted", async () => {
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback({ submitted: true }) }, global });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("已记录反馈");
    expect(wrapper.text()).not.toContain("确认无误");
  });

  it("surfaces replay and stale-prompt states explicitly", async () => {
    api.mockResolvedValue({ ...successResponse, alreadySubmitted: true });
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text().includes("确认无误"))?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("重复提交不会产生重复记录");

    api.mockRejectedValue(Object.assign(new Error("stale"), { data: { error: { code: "OCR_PROMPT_STALE", message: "stale" } } }));
    const staleWrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await staleWrapper.vm.$nextTick();
    await staleWrapper.findAll("button").find((button) => button.text().includes("确认无误"))?.trigger("click");
    await flushPromises();
    expect(staleWrapper.emitted("stale")).toBeTruthy();
  });

  it("does not render a confirmation control when mode is none and feedback is unavailable", async () => {
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback({ mode: "none", promptOrigin: null, promptFieldKeys: [], available: false }) }, global });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("确认无误");
    expect(wrapper.findAll("button").length).toBe(0);
  });

  it("applies the compact responsive layout at mobile widths without hiding controls", async () => {
    const matches = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("matchMedia", matches);
    const wrapper = await mountSuspended(OcrFeedbackPanel, {
      props: { submissionId: "submission-1", feedback: feedback({ mode: "grouped", promptOrigin: "grouped", promptFieldKeys: ["difficulty", "viewer_player"] }) },
      global,
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".ocr-feedback--compact").exists()).toBe(true);
    expect(wrapper.findAll("button").length).toBeGreaterThanOrEqual(3);
    expect(wrapper.findAll("input").length).toBe(2);
    vi.unstubAllGlobals();
  });

  it("keeps the two-column row layout at wider widths", async () => {
    const matches = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("matchMedia", matches);
    const wrapper = await mountSuspended(OcrFeedbackPanel, { props: { submissionId: "submission-1", feedback: feedback() }, global });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".ocr-feedback--compact").exists()).toBe(false);
    vi.unstubAllGlobals();
  });
});
