import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OcrFeedbackPanel from "./OcrFeedbackPanel.vue";

const api = vi.fn();
mockNuxtImport("usePortalApi", () => () => api);

const mountPanel = (accuracy: "accurate" | "inaccurate" | null = null) =>
  mountSuspended(OcrFeedbackPanel, { props: { submissionId: "sub/1", feedback: { ocrResultId: "ocr-1", accuracy } } });
const press = async (wrapper: Awaited<ReturnType<typeof mountPanel>>, name: string) => {
  await wrapper.get(`button[aria-label="${name}"]`).trigger("click");
  await flushPromises();
};

beforeEach(() => api.mockReset());

describe("OCR feedback", () => {
  it("records the mark against the shown OCR result with an idempotency key", async () => {
    api.mockResolvedValue({});
    const wrapper = await mountPanel();
    await press(wrapper, "识别有误");

    const [path, options] = api.mock.calls[0]!;
    expect(path).toBe("/v1/me/submissions/sub%2F1/ocr-feedback");
    expect(options.method).toBe("POST");
    expect(options.body).toMatchObject({ ocrResultId: "ocr-1", accuracy: "inaccurate" });
    expect(options.headers["Idempotency-Key"]).toBeTruthy();
    expect(wrapper.emitted("recorded")).toHaveLength(1);
  });

  it("does not resend a mark that is already recorded", async () => {
    const wrapper = await mountPanel("accurate");
    await press(wrapper, "识别准确");
    expect(api).not.toHaveBeenCalled();
  });

  it("asks the page to reload when the OCR result was superseded", async () => {
    api.mockRejectedValueOnce(Object.assign(new Error("superseded"), { statusCode: 409, data: { error: { code: "OCR_PROMPT_STALE" } } }));
    const wrapper = await mountPanel();
    await press(wrapper, "识别准确");
    expect(wrapper.emitted("stale")).toHaveLength(1);
    expect(wrapper.emitted("recorded")).toBeUndefined();
  });

  it("keeps the buttons usable after a failure so the player can retry", async () => {
    api.mockRejectedValueOnce(Object.assign(new Error("down"), { statusCode: 503 })).mockResolvedValueOnce({});
    const wrapper = await mountPanel();
    await press(wrapper, "识别准确");
    expect(wrapper.emitted("recorded")).toBeUndefined();
    expect(wrapper.get("[role=status]").text()).not.toBe("");
    await press(wrapper, "识别准确");
    expect(wrapper.emitted("recorded")).toHaveLength(1);
  });
});
