import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ReviewsPage from "./reviews.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/submissions?status=received,evidence_pending,evidence_stored,upload_pending,ocr_pending,ready_for_review,ocr_review_required,approved,rejected,resubmission_required&page=1&pageSize=20") return Promise.resolve({ items: [{ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null }, { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "他又", status: "ocr_review_required", challenge: null, ocrStatus: "review_required", ocrAttempt: 1, ocrErrorCode: null }, { submissionId: "submission-3", mapName: "尼泊尔", difficulty: "地狱", playerName: "他又", status: "evidence_stored", challenge: null, ocrStatus: "not_started", ocrAttempt: null, ocrErrorCode: null }, { submissionId: "submission-4", mapName: "绿洲城", difficulty: "困难", playerName: "他又", status: "approved", challenge: null, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null }], total: 4 });
  if (path === "/v1/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, ocr: { model_version: "v1", request_id: "ocr-request-1", data: { map_name: "帕拉伊苏", difficulty: "困难", viewer_player: "他又", challenge_completed: true }, fields: { map_name: { confidence: 0.98, status: "ok" }, difficulty: { confidence: 0.97, status: "ok" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.99, status: "ok" } }, warnings: ["right_panel.version_missing"] } });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin reviews page", () => {
  it("opens the submission detail sheet", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ReviewsPage, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.findAll(".admin-table tbody tr")).toHaveLength(4);
    await wrapper.findAll(".admin-table button").find((button) => button.text() === "查看")!.trigger("click");
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("守望先锋");
    expect(document.body.textContent).toContain("OCRKit");
    expect(document.body.textContent).toContain("已匹配");
    expect(document.body.textContent).toContain("识别结果");
    expect(document.body.textContent).toContain("98%");
  });
});
