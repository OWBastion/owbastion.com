import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import type { AdminMasteryRunDetail as MasteryRunDetail } from "~/composables/useAdminApi";
import AdminMasteryRunDetail from "./AdminMasteryRunDetail.vue";

const detail: MasteryRunDetail = {
  contractVersion: "1",
  run: {
    runId: "00000000-0000-4000-8000-000000000001",
    playerAccountId: "00000000-0000-4000-8000-000000000002",
    playerId: "1234",
    playerName: "Tester",
    sourceSubmissionId: "00000000-0000-4000-8000-000000000003",
    mapId: "map.test",
    mapName: "测试地图",
    gameplayRevisionId: "revision:map.test:initial",
    gameplayRevisionLifecycle: "default",
    mapVariant: null,
    difficulty: "困难",
    gameVersion: "26.0810.1",
    runCode: "1234-5678-9012",
    completionDurationSeconds: 600,
    deaths: 1,
    skips: 0,
    eventCounters: { "event.alpha": 2 },
    acceptanceSource: "submission_review",
    acceptedAt: 1,
    status: "active",
    invalidatedAt: null,
    invalidatedBy: null,
    invalidationReason: null,
    xpRuleVersion: "v1",
    xpInputSnapshot: { ruleVersion: "v1", baseDifficultyXp: 225, mapFactor: 1, performanceBonus: 11, performanceBonusReasons: ["no_skips"], challengeBonus: 0 },
    awardedXp: 236,
    conflictCount: 1,
  },
  projection: {
    mapId: "map.test",
    gameplayRevisionId: "revision:map.test:initial",
    totalXp: 236,
    verifiedRunCount: 1,
    difficultyStats: [{ difficulty: "困难", verifiedRunCount: 1, fastestCompletionSeconds: 600 }],
    lowestDeaths: 1,
    fewestSkips: 0,
    highestSingleRunXp: 236,
    highestCompletedDifficulty: "困难",
  },
  sourceSubmission: {
    submissionId: "00000000-0000-4000-8000-000000000003",
    status: "approved",
    challengeId: "",
    challenge: null,
    mapName: "测试地图",
    difficulty: "困难",
    playerAccountId: "00000000-0000-4000-8000-000000000002",
    playerName: "Tester",
    createdAt: 1,
    updatedAt: 2,
    ocrStatus: "matched",
    ocrAttempt: 1,
    ocrErrorCode: null,
    ocr: null,
    evidenceUrl: null,
  },
  lifecycle: [{ transition: "accepted", actorType: "service", actorId: "submission_review", reason: null, createdAt: 1 }],
  conflicts: [{
    submissionId: "00000000-0000-4000-8000-000000000004",
    submissionStatus: "ocr_review_required",
    playerAccountId: "00000000-0000-4000-8000-000000000002",
    playerName: "Tester",
    conflictFields: ["difficulty", "completion_duration"],
    facts: { mapName: "测试地图", mapVariant: null, difficulty: "传奇", gameVersion: "26.0810.1", runCode: "1234-5678-9012", completionDurationSeconds: 550, deaths: 1, skips: 0 },
    resolution: null,
  }],
};

describe("AdminMasteryRunDetail", () => {
  it("renders maintainer-only run facts and emits auditable reconciliation actions", async () => {
    const wrapper = await mountSuspended(AdminMasteryRunDetail, {
      props: { detail },
      global: {
        stubs: {
          StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
          NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" },
        },
      },
    });

    expect(wrapper.text()).toContain("1234-5678-9012");
    expect(wrapper.text()).toContain("经验规则与地图档案");
    expect(wrapper.text()).toContain("差异字段");
    expect(wrapper.text()).toContain("难度、通关用时");
    expect(wrapper.find('a[href="/admin/reviews/00000000-0000-4000-8000-000000000003"]').exists()).toBe(true);

    const buttons = wrapper.findAll("button");
    await buttons.find((button) => button.text() === "作废通关记录")!.trigger("click");
    await buttons.find((button) => button.text() === "作废原记录")!.trigger("click");
    expect(wrapper.emitted("state")).toEqual([["invalidate"]]);
    expect(wrapper.emitted("conflict")).toEqual([[{ submissionId: "00000000-0000-4000-8000-000000000004", action: "invalidate_existing" }]]);
  });
});
