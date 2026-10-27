import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReviewPage from "./[submissionId].vue";

const { api, refresh, detail, previewRequests } = vi.hoisted(() => ({
  api: vi.fn(), refresh: vi.fn(), detail: { onData: null as null | ((data: unknown) => void) },
  previewRequests: [] as Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>,
}));
mockNuxtImport("useAdminApi", () => () => api);
mockNuxtImport("useToast", () => () => ({ add: vi.fn() }));
mockNuxtImport("navigateTo", () => vi.fn());
mockNuxtImport("useRoute", () => () => ({ params: { submissionId: "submission.preview" }, query: {}, fullPath: "/admin/reviews/submission.preview" }));
mockNuxtImport("useAdminAsyncData", () => (_key: string, _handler: unknown, options: { onData: (value: unknown) => void }) => {
  detail.onData = options.onData;
  return { loading: false, refresh };
});

const submission = { submissionId: "submission.preview", status: "ocr_review_required", mapName: "地图", ocr: { data: { difficulty: "困难" } } };
const preview = (label: string) => ({ label });
const rawInput = {
  fieldCorrections: [{ fieldKey: "mode", reviewedValue: " 随机事件5.0 " }, { fieldKey: "difficulty", reviewedValue: " 地狱 " }],
  confirmedChallengeIds: ["b", "a", "b"],
};
const Detail = defineComponent({
  props: ["preview", "previewCurrent", "previewLoading", "previewError"],
  emits: ["review-input", "retry-preview", "review"],
  setup(props, { emit }) {
    const input = (fieldCorrections: object[], confirmedChallengeIds: string[] = []) => emit("review-input", { fieldCorrections, confirmedChallengeIds });
    return () => h("div", [
      h("p", { role: "status" }, `${props.preview?.label ?? "none"} ${props.previewCurrent ? "current" : "outdated"} ${props.previewLoading ? "loading" : "idle"} ${props.previewError}`),
      h("button", { onClick: () => input([]) }, "Original"),
      h("button", { onClick: () => input([{ fieldKey: "difficulty", reviewedValue: "地狱" }], ["b", "a"]) }, "Correct"),
      h("button", { onClick: () => input([{ fieldKey: "difficulty", reviewedValue: " 地狱 " }], ["a", "b", "a"]) }, "Equivalent"),
      h("button", { onClick: () => emit("review-input", rawInput) }, "Unnormalized"),
      h("button", { onClick: () => emit("review", "approved") }, "Approve"),
      h("button", { onClick: () => emit("review", "rejected") }, "Reject"),
      h("button", { onClick: () => emit("retry-preview") }, "Retry"),
    ]);
  },
});
const mountPage = async () => {
  api.mockImplementation(() => new Promise((resolve, reject) => previewRequests.push({ resolve, reject })));
  const wrapper = await mountSuspended(ReviewPage, { global: { stubs: { AdminSubmissionReviewDetail: Detail } } });
  detail.onData!(submission);
  await flushPromises();
  return wrapper;
};
const debounce = async () => { await vi.advanceTimersByTimeAsync(350); await flushPromises(); };
afterEach(() => { vi.useRealTimers(); api.mockReset(); previewRequests.length = 0; });

describe("submission review previews", () => {
  it.each(["approved", "rejected"] as const)("preserves the maintainer's input when %s", async (decision) => {
    const wrapper = await mountPage();
    vi.useFakeTimers();
    await wrapper.findAll("button").find((button) => button.text() === "Unnormalized")!.trigger("click");
    await debounce();
    expect(api).toHaveBeenLastCalledWith(expect.stringContaining("/review/preview"), { method: "POST", body: { contractVersion: "1", ...rawInput } });
    previewRequests[1]!.resolve(preview("corrected"));
    await flushPromises();
    api.mockResolvedValueOnce({ decision }).mockResolvedValueOnce({ items: [] });
    await wrapper.findAll("button").find((button) => button.text() === (decision === "approved" ? "Approve" : "Reject"))!.trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/review$/), expect.objectContaining({ body: {
      contractVersion: "1", decision, fieldCorrections: rawInput.fieldCorrections,
      ...(decision === "approved" ? { confirmedChallengeIds: rawInput.confirmedChallengeIds } : {}),
    } }));
    wrapper.unmount();
  });

  it("reuses an in-flight preview when inputs return to its key during debounce", async () => {
    const wrapper = await mountPage();
    vi.useFakeTimers();
    await wrapper.findAll("button").find((button) => button.text() === "Correct")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "Original")!.trigger("click");
    await debounce();
    expect(api).toHaveBeenCalledTimes(1);
    previewRequests[0]!.resolve(preview("original"));
    await flushPromises();
    expect(wrapper.text()).toContain("original current idle");
    wrapper.unmount();
  });

  it("deduplicates effective inputs and refreshes after authoritative detail reloads", async () => {
    const wrapper = await mountPage();
    vi.useFakeTimers();
    await wrapper.get("button").trigger("click");
    await debounce();
    expect(api).toHaveBeenCalledTimes(1);
    previewRequests[0]!.resolve(preview("original"));
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Correct")!.trigger("click");
    await debounce();
    expect(api).toHaveBeenCalledTimes(2);
    await wrapper.findAll("button").find((button) => button.text() === "Equivalent")!.trigger("click");
    await debounce();
    expect(api).toHaveBeenCalledTimes(2);
    previewRequests[1]!.resolve(preview("corrected"));
    await flushPromises();
    expect(wrapper.text()).toContain("corrected current idle");
    detail.onData!({ ...submission, ocr: { data: { difficulty: "简单" } } });
    await flushPromises();
    expect(api).toHaveBeenCalledTimes(3);
    expect(wrapper.text()).toContain("corrected outdated loading");
    previewRequests[2]!.resolve(preview("refreshed"));
    await flushPromises();
    expect(wrapper.text()).toContain("refreshed current idle");
    wrapper.unmount();
  });

  it("ignores a response during debounce and responses from an older detail version", async () => {
    const wrapper = await mountPage();
    vi.useFakeTimers();
    await wrapper.findAll("button").find((button) => button.text() === "Correct")!.trigger("click");
    previewRequests[0]!.resolve(preview("stale original"));
    await flushPromises();
    expect(wrapper.text()).not.toContain("stale original");
    await debounce();
    detail.onData!({ ...submission });
    await flushPromises();
    previewRequests[2]!.resolve(preview("latest"));
    await flushPromises();
    previewRequests[1]!.resolve(preview("stale corrected"));
    await flushPromises();
    expect(wrapper.text()).toContain("latest current idle");
    expect(wrapper.text()).not.toContain("stale corrected");
    wrapper.unmount();
  });

  it("shows request errors and allows an explicit retry", async () => {
    const wrapper = await mountPage();
    previewRequests[0]!.reject(new Error("network"));
    await flushPromises();
    expect(wrapper.text()).toContain("network");
    await wrapper.findAll("button").find((button) => button.text() === "Retry")!.trigger("click");
    expect(api).toHaveBeenCalledTimes(2);
    previewRequests[1]!.resolve(preview("retried"));
    await flushPromises();
    expect(wrapper.text()).toContain("retried current idle");
    wrapper.unmount();
  });
});
