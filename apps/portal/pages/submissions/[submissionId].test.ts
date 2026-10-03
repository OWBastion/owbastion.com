import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SubmissionPage from "./[submissionId].vue";

const baseSubmission = {
  submissionId: "submission-1",
  status: "rejected",
  resubmissionRequired: true,
  mapName: "帕拉伊苏",
  difficulty: "困难",
  reason: "截图证据需要重新提交",
  createdAt: 0,
  updatedAt: 1,
  evidenceUrl: "https://example.test/evidence.png",
  ocrFailCount: 1,
  manualReviewEligible: false,
  ocr: { mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", challengeCompleted: true, modelVersion: "ocr-v3" },
};

const api = vi.fn((path?: string, options?: { method?: string }) => {
  if (path?.includes("/challenge") && options?.method === "POST") return Promise.resolve({});
  if (path?.includes("/manual-review") && options?.method === "POST") return Promise.resolve({});
  return Promise.resolve({ ...baseSubmission });
});
mockNuxtImport("usePortalApi", () => () => api);

const stubs = {
  StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
  SubmissionStatusBadge: { props: ["status"], template: "<span>{{ status }}</span>" },
  SubmissionProgress: { template: '<div class="progress-card">处理未通过</div>' },
  OcrFeedbackPanel: {
    props: ["submissionId", "feedback"],
    template: `<section aria-label="识别反馈">{{ submissionId }}:{{ feedback.ocrResultId }}</section>`,
  },
};

async function mountSubmission(route = "/submissions/submission-1") {
  const wrapper = await mountSuspended(SubmissionPage, {
    route,
    global: { stubs },
  });
  await flushPromises();
  return wrapper;
}

describe("submission detail page", () => {
  it("shows status alert before evidence and distinguishes evidence read failure", async () => {
    api.mockClear();
    api.mockImplementation(() => Promise.resolve({ ...baseSubmission }));
    const wrapper = await mountSubmission();

    expect(wrapper.text()).toContain("需重新提交");
    expect(wrapper.text()).toContain("截图证据需要重新提交");
    expect(wrapper.text()).toContain("识别摘要");
    expect(wrapper.text()).toContain("识别模型");
    expect(wrapper.text()).toContain("ocr-v3");
    expect(wrapper.text()).toContain("提交编号");
    expect(wrapper.text()).toContain("最后更新");
    expect(wrapper.get('a[href="/submissions/new"]').text()).toContain("重新提交截图");
    expect(wrapper.text()).toContain("重新提交建议");
    expect(wrapper.text()).toContain("处理未通过");
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
    expect(wrapper.get('img[alt="帕拉伊苏的提交截图"]').attributes("src")).toBe("https://example.test/evidence.png");

    await wrapper.get('img[alt="帕拉伊苏的提交截图"]').trigger("error");
    expect(wrapper.text()).toContain("无法读取截图");
    expect(wrapper.text()).not.toContain("暂无截图");

    const requestCount = api.mock.calls.length;
    await wrapper.get('button[aria-label="刷新状态"]').trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledTimes(requestCount + 1);
  });

  it("shows missing evidence as a distinct empty state", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-missing",
      status: "processing",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: null,
    }));
    const wrapper = await mountSubmission("/submissions/submission-missing");
    expect(wrapper.text()).toContain("暂无截图");
    expect(wrapper.text()).not.toContain("无法读取截图");
  });

  it("passes compact needs-review status to the status badge", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-waiting",
      status: "needs_review",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: "https://example.test/evidence.png",
    }));
    const waiting = await mountSubmission("/submissions/submission-waiting");
    expect(waiting.text()).toContain("needs_review");

    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-ocr-review",
      status: "needs_review",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: "https://example.test/evidence.png",
    }));
    const ocrReview = await mountSubmission("/submissions/submission-ocr-review");
    expect(ocrReview.text()).toContain("needs_review");
  });

  it("hides manual review button when the API marks the submission ineligible", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-1",
      status: "rejected",
      resubmissionRequired: true,
      mapName: "帕拉伊苏",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: "https://example.test/evidence.png",
      manualReviewEligible: false,
    }));
    const wrapper = await mountSubmission();
    expect(wrapper.find('[aria-label="申请人工核对"]').exists()).toBe(false);
  });

  it("shows manual review errors without silent idle recovery", async () => {
    api.mockImplementation((path?: string, options?: { method?: string }) => {
      if (path?.includes("/manual-review") && options?.method === "POST") return Promise.reject(new Error("manual failed"));
      return Promise.resolve({
        ...baseSubmission,
        submissionId: "submission-eligible",
        manualReviewEligible: true,
      });
    });
    const wrapper = await mountSubmission("/submissions/submission-eligible");
    const btn = wrapper.find('[aria-label="申请人工核对"]');
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("无法申请人工核对");
    expect(wrapper.find('[aria-label="申请人工核对"]').exists()).toBe(true);
    expect(wrapper.get('[aria-live="polite"]').attributes("aria-atomic")).toBe("true");
    expect(wrapper.text().match(/已提交申请/g)?.length ?? 0).toBe(0);
  });

  it("announces manual-review success once without duplicating visible success feedback", async () => {
    api.mockImplementation((path?: string, options?: { method?: string }) => {
      if (path?.includes("/manual-review") && options?.method === "POST") return Promise.resolve({});
      return Promise.resolve({
        ...baseSubmission,
        submissionId: "submission-manual-ok",
        status: "needs_review",
        manualReviewEligible: true,
      });
    });
    const wrapper = await mountSubmission("/submissions/submission-manual-ok");
    await wrapper.get('[aria-label="申请人工核对"]').trigger("click");
    await flushPromises();
    const live = wrapper.get('[aria-live="polite"]');
    expect(live.attributes("aria-live")).toBe("polite");
    expect(live.text()).toContain("已提交申请，请等待核对结果。");
    expect(live.text().match(/已提交申请/g)?.length).toBe(1);
    expect(wrapper.find('[aria-label="申请人工核对"]').exists()).toBe(false);
    expect(wrapper.findAll("[aria-live='polite']")).toHaveLength(1);
  });



  it("does not ask the player to select a challenge", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-needs-review",
      status: "needs_review",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: "https://example.test/evidence.png",
    }));
    const wrapper = await mountSubmission("/submissions/submission-needs-review");
    expect(wrapper.text()).not.toContain("确认挑战");
    expect(wrapper.text()).not.toContain("选择挑战");
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining("/challenge"), expect.objectContaining({ method: "POST" }));
  });


  it("shows approved grant state distinctly", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-approved",
      status: "completed",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 2,
      evidenceUrl: "https://example.test/evidence.png",
      titleGrant: { grantId: "grant-1", titleKey: "CONQUEROR", titleName: "征服者", mapName: "花村" },
    }));
    const wrapper = await mountSubmission("/submissions/submission-approved");
    expect(wrapper.text()).toContain("已获得称号");
    expect(wrapper.text()).toContain("征服者");
  });

  it("shows safe mastery outcomes alongside an independent title outcome", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-mastery-created",
      status: "completed",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 2,
      evidenceUrl: "https://example.test/evidence.png",
      titleGrant: { grantId: "grant-1", titleKey: "CONQUEROR", titleName: "征服者", mapName: "花村" },
      verifiedRunOutcome: { status: "created", awardedXp: 225 },
    }));
    const created = await mountSubmission("/submissions/submission-mastery-created");
    expect(created.text()).toContain("已获得称号");
    expect(created.text()).toContain("精通记录已保存");
    expect(created.text()).toContain("获得 225 XP");

    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-mastery-reused",
      status: "completed",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 2,
      evidenceUrl: "https://example.test/evidence.png",
      verifiedRunOutcome: { status: "reused", awardedXp: 0 },
    }));
    const reused = await mountSubmission("/submissions/submission-mastery-reused");
    expect(reused.text()).toContain("这次通关已记录");

    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-mastery-ineligible",
      status: "rejected",
      resubmissionRequired: true,
      mapName: "花村",
      createdAt: 0,
      updatedAt: 2,
      evidenceUrl: "https://example.test/evidence.png",
      verifiedRunOutcome: { status: "ineligible", awardedXp: 0 },
    }));
    const ineligible = await mountSubmission("/submissions/submission-mastery-ineligible");
    expect(ineligible.text()).toContain("本次未计入精通进度");
  });

  it("shows approved without grant as a distinct passed state", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-passed",
      status: "completed",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 2,
      evidenceUrl: "https://example.test/evidence.png",
    }));
    const wrapper = await mountSubmission("/submissions/submission-passed");
    expect(wrapper.text()).toContain("completed");
    expect(wrapper.text()).not.toContain("已获得称号");
  });

  it("surfaces explicit refresh failures in the active status region", async () => {
    let refreshed = false;
    api.mockImplementation(() => {
      if (refreshed) return Promise.reject(new Error("refresh failed"));
      refreshed = true;
      return Promise.resolve({
        submissionId: "submission-refresh",
        status: "processing",
        mapName: "花村",
        createdAt: 0,
        updatedAt: 1,
        evidenceUrl: "https://example.test/evidence.png",
      });
    });
    const wrapper = await mountSubmission("/submissions/submission-refresh");
    expect(wrapper.text()).toContain("processing");
    await wrapper.get('button[aria-label="刷新状态"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[aria-live="polite"]').text()).toContain("无法刷新状态");
    expect(wrapper.text()).toContain("processing");
  });

  it("renders the OCR feedback panel when the submission has a current OCR result", async () => {
    api.mockImplementation(() => Promise.resolve({
      ...baseSubmission,
      status: "completed",
      reason: undefined,
      feedback: {
        ocrResultId: "00000000-0000-4000-8000-000000000004",
        accuracy: null,
      },
    }));
    const wrapper = await mountSubmission("/submissions/submission-feedback");
    const panel = wrapper.get('[aria-label="识别反馈"]');
    expect(panel.text()).toContain("00000000-0000-4000-8000-000000000004");
    expect(panel.text()).toContain("submission-1");
  });

  it("omits the OCR feedback panel when the submission has no OCR result", async () => {
    api.mockImplementation(() => Promise.resolve({ ...baseSubmission, status: "completed", reason: undefined }));
    const wrapper = await mountSubmission("/submissions/submission-no-feedback");
    expect(wrapper.find('[aria-label="识别反馈"]').exists()).toBe(false);
  });
});
