import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MasteryRunsPage from "./index.vue";

const run = {
  runId: "00000000-0000-4000-8000-000000000001",
  playerAccountId: "00000000-0000-4000-8000-000000000002",
  playerId: "1234",
  playerName: "Tester",
  sourceSubmissionId: "00000000-0000-4000-8000-000000000003",
  mapId: "map.test",
  mapName: "测试地图",
  mapVariant: null,
  difficulty: "困难" as const,
  gameVersion: "26.0810.1",
  runCode: "1234-5678-9012",
  completionDurationSeconds: 600,
  deaths: 1,
  skips: 0,
  eventCounters: {},
  acceptanceSource: "submission_review" as const,
  acceptedAt: 1,
  status: "active" as const,
  invalidatedAt: null,
  invalidatedBy: null,
  invalidationReason: null,
  xpRuleVersion: "v1" as const,
  xpInputSnapshot: { ruleVersion: "v1" as const, baseDifficultyXp: 225, mapFactor: 1, performanceBonus: 11, performanceBonusReasons: ["no_skips" as const], challengeBonus: 0 },
  awardedXp: 236,
  conflictCount: 1,
};
const detail = {
  contractVersion: "1" as const,
  run,
  projection: { mapId: "map.test", totalXp: 236, verifiedRunCount: 1, difficultyStats: [], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 236, highestCompletedDifficulty: "困难" as const },
  sourceSubmission: { submissionId: run.sourceSubmissionId, status: "approved", challengeId: "", challenge: null, mapName: "测试地图", difficulty: "困难", playerAccountId: run.playerAccountId, playerName: run.playerName, createdAt: 1, updatedAt: 2, ocrStatus: "matched" as const, ocrAttempt: 1, ocrErrorCode: null, ocr: null, evidenceUrl: null },
  lifecycle: [{ transition: "accepted" as const, actorType: "service" as const, actorId: "submission_review", reason: null, createdAt: 1 }],
  conflicts: [],
};
const adminApi = vi.fn((path: string) => {
  if (path === "/v1/mastery-runs?page=1&pageSize=20" || path === "/v1/mastery-runs?page=1&pageSize=20&runCode=1234-5678-9012") return Promise.resolve({ items: [run], total: 1 });
  if (path === `/v1/mastery-runs/${run.runId}`) return Promise.resolve(detail);
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin mastery runs page", () => {
  it("loads a document-flow admin list, filters by run code, and opens maintainer detail", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(MasteryRunsPage, {
      attachTo: document.body,
      global: {
        stubs: {
          StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
          NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" },
          AdminResponsiveDialog: { template: "<div><slot name=\"body\" /><slot name=\"footer\" /></div>" },
        },
      },
    });
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/mastery-runs?page=1&pageSize=20");
    expect(wrapper.find('input[aria-label="按通关码筛选"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("测试地图");
    expect(wrapper.text()).toContain("1234-5678-9012");

    await wrapper.find('input[aria-label="按通关码筛选"]').setValue("1234-5678-9012");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/mastery-runs?page=1&pageSize=20&runCode=1234-5678-9012");

    await wrapper.findAll("button").find((button) => button.text() === "详情")!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(`/v1/mastery-runs/${run.runId}`);
    expect(wrapper.text()).toContain("经验规则与地图档案");
  });
});
