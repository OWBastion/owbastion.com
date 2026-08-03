import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import SubmissionPage from "./[submissionId].vue";

const api = vi.fn(() => Promise.resolve({ submissionId: "submission-1", status: "resubmission_required", mapName: "帕拉伊苏", difficulty: "困难", reason: "OCR 结果与目标挑战不匹配", createdAt: 0, updatedAt: 1, ocrFailCount: 1, manualReviewEligible: false, ocr: { mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", challengeCompleted: true } }));
mockNuxtImport("usePortalApi", () => () => api);

describe("submission detail page", () => {
  it("shows private evidence, OCR summary, and refreshes the detail", async () => {
    api.mockClear();
    const wrapper = await mountSuspended(SubmissionPage, { route: "/submissions/submission-1", global: { stubs: { StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" }, SubmissionProgress: { template: '<div class="progress-card">处理未通过</div>' } } } });
    await flushPromises();
    expect(wrapper.text()).toContain("需重新提交");
    expect(wrapper.text()).toContain("OCR 结果与目标挑战不匹配");
    expect(wrapper.text()).toContain("识别摘要");
    expect(wrapper.text()).toContain("提交编号");
    expect(wrapper.text()).toContain("最后更新");
    expect(wrapper.get('a[href="/submissions/new"]').text()).toContain("重新提交截图");
    expect(wrapper.get(".resubmission-card").text()).toContain("重新提交建议");
    expect(wrapper.get(".progress-card").text()).toContain("处理未通过");
    expect(wrapper.findAll(".detail-grid > div").map((column) => column.classes())).toEqual([["evidence-col"], ["info-col"]]);
    expect(wrapper.find(".evidence-frame").exists()).toBe(false);
    expect(wrapper.get(".evidence-image").attributes("src")).toBe("/api/portal/submissions/submission-1/evidence");
    await wrapper.get(".evidence-image").trigger("error");
    expect(wrapper.text()).toContain("暂无截图。");
    const requestCount = api.mock.calls.length;
    await wrapper.get('button[aria-label="刷新状态"]').trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledTimes(requestCount + 1);
  });

  it("hides manual review button when the API marks the submission ineligible", async () => {
    api.mockClear();
    const wrapper = await mountSuspended(SubmissionPage, { route: "/submissions/submission-1", global: { stubs: { StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" }, SubmissionProgress: { template: '<div class="progress-card">处理未通过</div>' } } } });
    await flushPromises();
    expect(wrapper.find('[aria-label="申请人工核对"]').exists()).toBe(false);
  });

  it("shows manual review button when the API marks the submission eligible and calls the correct endpoint", async () => {
    api.mockImplementation(() => Promise.resolve({ submissionId: "submission-eligible", status: "resubmission_required", mapName: "帕拉伊苏", difficulty: "困难", reason: "OCR 结果与目标挑战不匹配", createdAt: 0, updatedAt: 1, ocrFailCount: 1, manualReviewEligible: true, ocr: { mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", challengeCompleted: true } }));
    const wrapper = await mountSuspended(SubmissionPage, { route: "/submissions/submission-eligible", global: { stubs: { StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" }, SubmissionProgress: { template: '<div class="progress-card">处理未通过</div>' } } } });
    await flushPromises();
    const btn = wrapper.find('[aria-label="申请人工核对"]');
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    await flushPromises();
    const calls = api.mock.calls.map((call) => call[0]);
    expect(calls).toContain(`/v1/player/submissions/submission-eligible/manual-review`);
  });

  it("places challenge confirmation before the submission overview", async () => {
    api.mockImplementation((path: string) => {
      if (path === "/v1/maps") return Promise.resolve({ items: [] });
      if (path === "/v1/challenges?family=map") return Promise.resolve({ items: [] });
      if (path === "/v1/challenges?family=achievement") return Promise.resolve({ items: [] });
      return Promise.resolve({ submissionId: "submission-awaiting", status: "awaiting_player_confirmation", mapName: "花村", createdAt: 0, updatedAt: 1, ocr: { mapName: "花村", difficulty: "地狱", playerName: "他又", challengeCompleted: true, achievementTitles: [] } });
    });
    const wrapper = await mountSuspended(SubmissionPage, { route: "/submissions/submission-awaiting", global: { stubs: { StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" }, SubmissionProgress: { template: '<div class="progress-card">等待确认挑战</div>' } } } });
    await flushPromises();

    const infoCards = wrapper.findAll(".info-col > *").map((card) => card.classes());
    expect(infoCards[0]).toContain("confirm-card");
    expect(infoCards[1]).toContain("overview-card");
  });
});
