import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import ReviewDetailPage from "./[submissionId].vue";

const adminApi = vi.fn((path: string, options?: { method?: string }) => {
  if (path === "/v1/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", createdAt: 0, updatedAt: 1, challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/test/high-entropy-key.png", ocr: { model_version: "v1", request_id: "ocr-request-1", data: { map_name: "帕拉伊苏", difficulty: "地狱", viewer_player: "他又", challenge_completed: true }, fields: { map_name: { confidence: 0.98, status: "ok" }, difficulty: { confidence: 0.97, status: "ok" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.99, status: "ok" } }, warnings: ["right_panel.version_missing"] }, match: { outcome: "review", candidates: [{ challengeId: "map.paraiso.hell", challengeType: "difficulty_completion", targetMapName: "帕拉伊苏", targetDifficulty: "地狱", matched: false, conditionsSupported: true, requiredFields: ["map_name", "difficulty", "challenge_completed"], quality: { accepted: true } }, { challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", matched: true, conditionsSupported: true, requiredFields: ["achievement_titles"], quality: { accepted: true } }, { challengeId: "map.paraiso.legend", challengeType: "difficulty_completion", targetMapName: "帕拉伊苏", targetDifficulty: "传奇", matched: true, conditionsSupported: true, requiredFields: ["map_name", "difficulty", "challenge_completed"], quality: { accepted: true } }] } });
  if (path === "/v1/submissions/submission-2") return Promise.resolve({ submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "他又", status: "approved", createdAt: 0, updatedAt: 1, challenge: null, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, evidenceUrl: null, ocr: null });
  if (path === "/v1/submissions/submission-3") return Promise.resolve({ submissionId: "submission-3", mapName: "绿洲城", difficulty: "困难", playerName: "他又", status: "approved", createdAt: 0, updatedAt: 1, challenge: null, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, evidenceUrl: null, ocr: null, spotCheck: { status: "pending", sampledAt: 1, resolvedAt: null, reviewer: null, reason: null } });
  if (path === "/v1/submissions/submission-1/review" && options?.method === "POST") return Promise.resolve({ decision: "approved", titleName: "守望先锋", alreadyOwned: false });
  if (path === "/v1/submissions/submission-1/ocr/retry" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", submissionId: "submission-1", status: "ocr_pending" });
  if (path === "/v1/submissions/submission-3/spot-check" && options?.method === "POST") return Promise.resolve({ contractVersion: "1", submissionId: "submission-3", status: "confirmed", grantId: "grant-1" });
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
    expect(wrapper.text()).toContain("成就挑战");
    expect(wrapper.text()).toContain("通过");
    expect(wrapper.text()).toContain("OCRKit");
    expect(wrapper.text()).not.toContain("识别字段与原始证据");
    expect(wrapper.text()).toContain("98%");
    expect(wrapper.text()).toContain("已识别");
    expect(wrapper.text()).toContain("左侧成就面板");
    expect(wrapper.text()).toContain("无");
    expect(wrapper.text()).not.toContain("98% · ok");
    expect(wrapper.text()).toContain("查看原始识别数据");
    expect(wrapper.text()).toContain("提交信息");
    for (const label of ["通过", "要求重新提交", "驳回", "重新发送 OCRKit 请求", "直接标注"]) {
      expect(wrapper.text()).toContain(label);
    }
    expect(wrapper.get(".evidence-image").attributes("src")).toBe("https://evidence.owbastion.codes/uploads/submissions/test/high-entropy-key.png");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it("submits a review and navigates back to the queue", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("通过"))!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-1/review", expect.objectContaining({ method: "POST" }));
  });

  it("keeps review actions available after the submission is already decided", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-2" });
    await flushPromises();
    expect(wrapper.text()).toContain("已通过");
    expect(wrapper.text()).toContain("通过");
    expect(wrapper.text()).toContain("要求重新提交");
    expect(wrapper.text()).toContain("驳回");
  });

  it("can resend the OCRKit request", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("重新发送 OCRKit 请求"))!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-1/ocr/retry", expect.objectContaining({ method: "POST" }));
  });

  it("opens direct annotation locally without changing the route", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("直接标注"))?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("直接标注");
  });

  it("shows condition matches as read-only and confirms corrected evidence on approval", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    expect(wrapper.text()).toContain("Challenge Conditions 匹配");
    expect(wrapper.text()).toContain("称号 HERO");
    expect(wrapper.text()).toContain("满足条件");
    expect(wrapper.text()).not.toContain("手动添加");
    expect(wrapper.text()).not.toContain("保存所选挑战");

    await wrapper.get('[role="checkbox"][aria-checked="false"]').trigger("click");
    await wrapper.get('input[aria-label="截图中的地图完整值"]').setValue("花村");
    await wrapper.findAll("button").find((button) => button.text().includes("通过"))!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-1/review", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "花村" }] }),
    }));
  });

  it("can resolve a pending automatic-decision spot check", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-3" });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("确认抽检"))!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-3/spot-check", expect.objectContaining({ method: "POST" }));
  });
});
