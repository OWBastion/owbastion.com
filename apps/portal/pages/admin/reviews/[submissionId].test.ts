import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import ReviewDetailPage from "./[submissionId].vue";

type PreviewBody = { confirmedChallengeIds?: string[]; fieldCorrections?: Array<{ fieldKey: string; reviewedValue: string }> };
const candidate = (overrides: Record<string, unknown>) => ({ family: "map", kind: "difficulty_completion", titleName: null, mapName: "帕拉伊苏", difficulty: "地狱", condition: null, requiredFields: ["map_name", "difficulty", "challenge_completed"], missingFields: [], selectedBy: null, ...overrides });
const reviewPreview = (body: PreviewBody = {}) => {
  const confirmed = new Set(body.confirmedChallengeIds ?? []);
  const candidates = [
    candidate({ challengeId: "c.legend", label: "帕拉伊苏 传奇", difficulty: "传奇", evidence: "matched", selectedBy: "conditions" }),
    candidate({ challengeId: "c.pioneer", kind: "map_title_achievement", label: "帕拉伊苏 开拓者", titleName: "开拓者", evidence: "needs_confirmation", missingFields: ["challenge_completed"], selectedBy: confirmed.has("c.pioneer") ? "reviewer" : null }),
    candidate({ challengeId: "c.hero", family: "achievement", kind: "title_achievement", label: "称号 HERO", titleName: "称号 HERO", mapName: null, difficulty: null, condition: "完成英雄挑战", evidence: "not_matched", requiredFields: ["achievement_titles"], selectedBy: confirmed.has("c.hero") ? "reviewer" : null }),
  ];
  const titles = [{ titleKey: "LEGEND", titleName: "传奇征服者", mapName: "帕拉伊苏", alreadyOwned: false }];
  if (confirmed.has("c.pioneer")) titles.push({ titleKey: "PIONEER", titleName: "开拓者", mapName: "帕拉伊苏", alreadyOwned: false });
  if (confirmed.has("c.hero")) titles.push({ titleKey: "HERO", titleName: "称号 HERO", mapName: null as unknown as string, alreadyOwned: false });
  return { contractVersion: "1", submissionId: "submission-1", evidenceOutcome: "review", candidates, completions: [], titles, verifiedRun: { status: "ineligible", reason: "missing_match_code" }, approvable: true, blockingCode: null };
};
const settlePreview = async () => { await new Promise((resolve) => setTimeout(resolve, 350)); await flushPromises(); };

const adminApi = vi.fn((path: string, options?: { method?: string; body?: unknown }) => {
  if (path === "/v1/submissions/submission-1/review/preview" && options?.method === "POST") return Promise.resolve(reviewPreview(options.body as PreviewBody));
  if (path === "/v1/submissions/submission-4/review/preview" && options?.method === "POST") return Promise.resolve({ ...reviewPreview(), submissionId: "submission-4", candidates: [], titles: [], approvable: false, blockingCode: "SUBMISSION_OUTCOME_NOT_CONFIGURED" });
  if (path === "/v1/submissions/submission-4") return Promise.resolve({ submissionId: "submission-4", mapName: "釜山", difficulty: "", playerName: "他又", status: "ocr_review_required", createdAt: 0, updatedAt: 1, challenge: null, ocrStatus: "review_required", ocrAttempt: 1, ocrErrorCode: null, evidenceUrl: null, ocr: { data: { map_name: "釜山" }, fields: {} } });
  if (path === "/v1/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "成就挑战", difficulty: "", playerName: "他又", status: "ready_for_review", createdAt: 0, updatedAt: 1, challenge: { family: "achievement", titleName: "守望先锋", category: "战绩", condition: "完成挑战", evidenceRule: "完整截图" }, ocrStatus: "matched", ocrAttempt: 1, ocrErrorCode: null, evidenceUrl: "https://evidence.owbastion.codes/uploads/submissions/test/high-entropy-key.png", ocr: { model_version: "v1", request_id: "ocr-request-1", data: { map_name: "帕拉伊苏", difficulty: "地狱", viewer_player: "他又", challenge_completed: true }, fields: { map_name: { confidence: 0.98, status: "ok" }, difficulty: { confidence: 0.97, status: "ok" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.99, status: "ok" } }, warnings: ["right_panel.version_missing"] }, match: { outcome: "review", candidates: [{ challengeId: "title.legacy", challengeType: "title_achievement", titleName: "旧匹配称号", quality: { accepted: false, reasons: ["achievement_evidence:low_confidence", "achievement_evidence:title_not_checked"] } }] } });
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
    expect(wrapper.text()).toContain("地图挑战");
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

  it("shows live Challenge results instead of stale stored match reasons", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    expect(wrapper.text()).toContain("Challenge 判定");
    expect(wrapper.text()).toContain("帕拉伊苏 传奇");
    expect(wrapper.text()).toContain("满足条件");
    expect(wrapper.text()).toContain("帕拉伊苏 开拓者");
    expect(wrapper.text()).toContain("缺少通关标记");
    expect(wrapper.text()).toContain("获得「传奇征服者」");
    expect(wrapper.text()).not.toContain("achievement_evidence");
    expect(wrapper.text()).not.toContain("旧匹配称号");
    // Not proposed by the evidence, so only reachable through search.
    expect(wrapper.text()).not.toContain("称号 HERO");
  });

  it("confirms a displayed Challenge, previews the outcome, and approves with the confirmation", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    const pioneer = wrapper.findAll(".match-candidate").find((item) => item.text().includes("帕拉伊苏 开拓者"))!;
    await pioneer.get('[role="checkbox"]').trigger("click");
    await settlePreview();
    expect(adminApi).toHaveBeenLastCalledWith("/v1/submissions/submission-1/review/preview", expect.objectContaining({ body: { contractVersion: "1", confirmedChallengeIds: ["c.pioneer"] } }));
    expect(wrapper.text()).toContain("获得「开拓者」");

    await wrapper.findAll("button").find((button) => button.text().includes("通过"))!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-1/review", expect.objectContaining({
      method: "POST",
      body: { contractVersion: "1", decision: "approved", confirmedChallengeIds: ["c.pioneer"] },
    }));
  });

  it("searches and adds an eligible Challenge that OCR did not propose", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    await wrapper.get('input[aria-label="搜索 Challenge"]').setValue("英雄");
    await wrapper.get('button[aria-label="添加 称号 HERO"]').trigger("click");
    await settlePreview();
    expect(adminApi).toHaveBeenLastCalledWith("/v1/submissions/submission-1/review/preview", expect.objectContaining({ body: { contractVersion: "1", confirmedChallengeIds: ["c.hero"] } }));
    expect(wrapper.findAll(".match-candidate").some((item) => item.text().includes("称号 HERO") && item.text().includes("已人工确认"))).toBe(true);
    expect(wrapper.text()).toContain("获得「称号 HERO」");
  });

  it("sends corrected fields to the preview and approval", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-1" });
    await flushPromises();
    await wrapper.findAll(".field-review__row")[0]!.get('[role="checkbox"]').trigger("click");
    await wrapper.get('input[aria-label="截图中的地图完整值"]').setValue("花村");
    await settlePreview();
    expect(adminApi).toHaveBeenLastCalledWith("/v1/submissions/submission-1/review/preview", expect.objectContaining({ body: { contractVersion: "1", fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "花村" }] } }));
    await wrapper.findAll("button").find((button) => button.text().includes("通过"))!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-1/review", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "花村" }] }),
    }));
  });

  it("does not allow approval when the preview has no outcome", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-4" });
    await flushPromises();
    expect(wrapper.text()).toContain("当前没有可产生的结果");
    const approve = wrapper.findAll("button").find((button) => button.text().includes("通过"))!;
    expect(approve.attributes("disabled")).toBeDefined();
    for (const label of ["要求重新提交", "驳回"]) {
      expect(wrapper.findAll("button").find((button) => button.text().includes(label))!.attributes("disabled")).toBeUndefined();
    }
  });

  it("can resolve a pending automatic-decision spot check", async () => {
    const wrapper = await mountSuspended(ReviewDetailPage, { route: "/admin/reviews/submission-3" });
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("确认抽检"))!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/submissions/submission-3/spot-check", expect.objectContaining({ method: "POST" }));
  });
});
