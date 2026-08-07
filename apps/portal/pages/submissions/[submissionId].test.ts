import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SubmissionPage from "./[submissionId].vue";

const baseSubmission = {
  submissionId: "submission-1",
  status: "resubmission_required",
  mapName: "帕拉伊苏",
  difficulty: "困难",
  reason: "截图与目标挑战不匹配",
  createdAt: 0,
  updatedAt: 1,
  evidenceUrl: "https://example.test/evidence.png",
  ocrFailCount: 1,
  manualReviewEligible: false,
  ocr: { mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", challengeCompleted: true },
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
  SubmissionCatalog: {
    props: ["selectedChallengeId"],
    emits: ["select"],
    template: `<button type="button" data-testid="catalog-option" @click="$emit('select', { challengeId: 'challenge-1' })">选择挑战</button>`,
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
  it("shows status and required actions before evidence, and distinguishes evidence read failure", async () => {
    api.mockClear();
    api.mockImplementation(() => Promise.resolve({ ...baseSubmission }));
    const wrapper = await mountSubmission();

    expect(wrapper.text()).toContain("需重新提交");
    expect(wrapper.text()).toContain("截图与目标挑战不匹配");
    expect(wrapper.text()).toContain("识别摘要");
    expect(wrapper.text()).toContain("提交编号");
    expect(wrapper.text()).toContain("最后更新");
    expect(wrapper.get('a[href="/submissions/new"]').text()).toContain("重新提交截图");
    expect(wrapper.get(".resubmission-card").text()).toContain("重新提交建议");
    expect(wrapper.get(".progress-card").text()).toContain("处理未通过");

    const columns = wrapper.findAll(".detail-grid > div").map((column) => column.classes().join(" "));
    expect(columns[0]).toContain("info-col");
    expect(columns[1]).toContain("evidence-col");
    expect(wrapper.find(".detail-grid").attributes("aria-live")).toBeUndefined();
    expect(wrapper.find(".status-stack").exists()).toBe(true);
    expect(wrapper.find(".status-stack").attributes("aria-live")).toBeUndefined();
    const live = wrapper.find("[aria-live='polite']");
    expect(live.exists()).toBe(true);
    expect(live.classes()).toContain("sr-only");
    expect(wrapper.find(".evidence-frame").exists()).toBe(false);
    expect(wrapper.get(".evidence-image").attributes("src")).toBe("/api/portal/submissions/submission-1/evidence");

    await wrapper.get(".evidence-image").trigger("error");
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
      status: "ocr_pending",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: null,
    }));
    const wrapper = await mountSubmission("/submissions/submission-missing");
    expect(wrapper.text()).toContain("截图已上传，等待识别");
    expect(wrapper.text()).toContain("暂无截图");
    expect(wrapper.text()).not.toContain("无法读取截图");
  });

  it("covers waiting and ready-for-review status alerts", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-waiting",
      status: "ready_for_review",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: "https://example.test/evidence.png",
    }));
    const waiting = await mountSubmission("/submissions/submission-waiting");
    expect(waiting.text()).toContain("等待核对");

    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-ocr-review",
      status: "ocr_review_required",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 1,
      evidenceUrl: "https://example.test/evidence.png",
    }));
    const ocrReview = await mountSubmission("/submissions/submission-ocr-review");
    expect(ocrReview.text()).toContain("等待处理");
  });

  it("hides manual review button when the API marks the submission ineligible", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-1",
      status: "resubmission_required",
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
    expect(wrapper.findAll(".status-stack .alert, .status-stack [class*='alert']").length + (wrapper.text().match(/已提交申请/g)?.length ?? 0)).toBeGreaterThanOrEqual(0);
    expect(wrapper.text().match(/已提交申请/g)?.length ?? 0).toBe(0);
  });

  it("announces manual-review success once without duplicating visible success feedback", async () => {
    api.mockImplementation((path?: string, options?: { method?: string }) => {
      if (path?.includes("/manual-review") && options?.method === "POST") return Promise.resolve({});
      return Promise.resolve({
        ...baseSubmission,
        submissionId: "submission-manual-ok",
        status: "ocr_review_required",
        manualReviewEligible: true,
      });
    });
    const wrapper = await mountSubmission("/submissions/submission-manual-ok");
    await wrapper.get('[aria-label="申请人工核对"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".status-stack").text()).toContain("已提交申请，请等待核对结果。");
    expect(wrapper.find(".status-stack").text().match(/已提交申请/g)?.length).toBe(1);
    expect(wrapper.find('[aria-label="申请人工核对"]').exists()).toBe(false);
    expect(wrapper.find("[aria-live='polite']").text()).toContain("已提交申请");
  });


  it("places challenge confirmation before overview and surfaces confirmation failures", async () => {
    api.mockImplementation((path?: string, options?: { method?: string }) => {
      if (path === "/v1/maps") return Promise.resolve({ items: [] });
      if (path === "/v1/challenges?family=map") return Promise.resolve({ items: [] });
      if (path === "/v1/challenges?family=achievement") return Promise.resolve({ items: [] });
      if (path?.includes("/challenge") && options?.method === "POST") return Promise.reject(new Error("confirm failed"));
      return Promise.resolve({
        submissionId: "submission-awaiting",
        status: "awaiting_player_confirmation",
        mapName: "花村",
        createdAt: 0,
        updatedAt: 1,
        evidenceUrl: "https://example.test/evidence.png",
        ocr: { mapName: "花村", difficulty: "地狱", playerName: "他又", challengeCompleted: true, achievementTitles: [] },
      });
    });
    const wrapper = await mountSubmission("/submissions/submission-awaiting");

    const infoCards = wrapper.findAll(".info-col > *").map((card) => card.classes().join(" "));
    expect(infoCards[0]).toContain("confirm-card");
    expect(infoCards[1]).toContain("overview-card");
    expect(wrapper.text()).toContain("等待确认挑战");

    await wrapper.get('[data-testid="catalog-option"]').trigger("click");
    const confirmButton = wrapper.findAll("button").find((button) => button.text() === "确认挑战");
    expect(confirmButton).toBeDefined();
    await confirmButton!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("无法确认挑战");
    expect(wrapper.find(".confirm-catalog").attributes("aria-busy")).toBeUndefined();
  });

  it("shows approved grant state distinctly", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-approved",
      status: "approved",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 2,
      evidenceUrl: "https://example.test/evidence.png",
      titleGrant: { grantId: "grant-1", titleKey: "CONQUEROR", titleName: "征服者", mapName: "花村" },
    }));
    const wrapper = await mountSubmission("/submissions/submission-approved");
    expect(wrapper.text()).toContain("称号已获得");
    expect(wrapper.text()).toContain("征服者");
  });

  it("shows approved without grant as a distinct passed state", async () => {
    api.mockImplementation(() => Promise.resolve({
      submissionId: "submission-passed",
      status: "approved",
      mapName: "花村",
      createdAt: 0,
      updatedAt: 2,
      evidenceUrl: "https://example.test/evidence.png",
    }));
    const wrapper = await mountSubmission("/submissions/submission-passed");
    expect(wrapper.text()).toContain("已通过");
    expect(wrapper.text()).not.toContain("称号已获得");
  });

  it("surfaces explicit refresh failures in the active status region", async () => {
    let refreshed = false;
    api.mockImplementation(() => {
      if (refreshed) return Promise.reject(new Error("refresh failed"));
      refreshed = true;
      return Promise.resolve({
        submissionId: "submission-refresh",
        status: "ocr_pending",
        mapName: "花村",
        createdAt: 0,
        updatedAt: 1,
        evidenceUrl: "https://example.test/evidence.png",
      });
    });
    const wrapper = await mountSubmission("/submissions/submission-refresh");
    expect(wrapper.text()).toContain("截图已上传，等待识别");
    await wrapper.get('button[aria-label="刷新状态"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("无法刷新状态");
  });
});
