import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import ReviewDetailPage from "./[submissionId].vue";

const adminApi = vi.fn((path: string, options?: { method?: string }) => {
  if (path === "/v1/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", createdAt: 0, updatedAt: 1, challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, evidenceUrl: null, ocr: { model_version: "v1", request_id: "ocr-request-1", data: { map_name: "帕拉伊苏", difficulty: "困难", viewer_player: "他又", challenge_completed: true }, fields: { map_name: { confidence: 0.98, status: "ok" }, difficulty: { confidence: 0.97, status: "ok" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.99, status: "ok" } }, warnings: ["right_panel.version_missing"] }});
  if (path === "/v1/submissions/submission-2") return Promise.resolve({ submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "他又", status: "approved", createdAt: 0, updatedAt: 1, challenge: null, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, evidenceUrl: null, ocr: null });
  if (path === "/v1/submissions/submission-1/review" && options?.method === "POST") return Promise.resolve({ decision: "approved", titleName: "守望先锋", alreadyOwned: false });
  if (path === "/v1/submissions/submission-1/ocr/retry" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", submissionId: "submission-1", status: "ocr_pending" });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: vi.fn() }));
mockNuxtImport("navigateTo", () => vi.fn(() => Promise.resolve()));
mockNuxtImport("useCurrentPlayer", () => () => ({ player: ref({ player: { isAdmin: true } }), status: ref("authenticated"), refresh: vi.fn() }));

describe("admin review detail page", () => {
  it("shows evidence, challenge, OCR data, and review actions", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    expect(wrapper.text()).toContain("守望先锋");
    expect(wrapper.text()).toContain("申请挑战");
    expect(wrapper.text()).toContain("OCRKit");
    expect(wrapper.text()).toContain("识别结果");
    expect(wrapper.text()).toContain("98%");
    expect(wrapper.text()).toContain("查看原始 OCR 响应");
    expect(wrapper.findAll(".actions button")).toHaveLength(3);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it("submits a review and navigates back to the queue", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    await wrapper.get(".actions button").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-1/review", expect.objectContaining({ method: "POST" }));
  });

  it("keeps review actions available after the submission is already decided", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-2" });
    await flushPromises();
    expect(wrapper.text()).toContain("已通过");
    expect(wrapper.find(".actions-card").exists()).toBe(true);
    expect(wrapper.findAll(".actions button")).toHaveLength(3);
  });

  it("can resend the OCRKit request", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    await wrapper.get(".ocr-retry-actions button").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-1/ocr/retry", expect.objectContaining({ method: "POST" }));
  });
});
