import { describe, expect, it } from "vitest";
import { adminAchievementCreateRequestSchema, adminCatalogTitleUpdateRequestSchema, adminChallengeSchema, adminChallengeUpdateRequestSchema, adminMapRevisionCreateRequestSchema, adminMapRevisionPromotionRequestSchema, adminMapRevisionUpdateRequestSchema, adminMapTitleRuleCreateRequestSchema, adminManualTitleGrantRequestSchema, adminPlayerDetailSchema, adminPlayerIdentityRequestSchema, adminRandomEventUpdateRequestSchema, adminRandomEventBatchRequestSchema, adminRandomEventVersionAvailabilityRequestSchema, adminRandomEventVersionListResponseSchema, adminSubmissionReviewPreviewRequestSchema, adminSubmissionReviewRequestSchema, adminSubmissionSchema, adminVerifiedRunCorrectionRequestSchema, adminVerifiedRunSchema, agentMapSchema, agentProjectedSpatialConfigSchema, agentSpatialConfigSchema, agentTitleListResponseSchema, bindingInviteRedeemRequestSchema, bindingInviteRedeemResponseSchema, currentPlayerMasteryResponseSchema, currentPlayerResponseSchema, mapChallengeSchema, ocrAccuracyFeedbackRequestSchema, ocrAccuracyFeedbackResponseSchema, playerReviewResponseSchema, playerReviewUpsertRequestSchema, playerReviewUpsertResponseSchema, playerReviewWithdrawRequestSchema, playerReviewWithdrawResponseSchema, playerSubmissionDetailSchema, playerUploadSessionRequestSchema, publicReviewCommentPageSchema, publicReviewSummaryResponseSchema, qqBindingRequestSchema, qqBindingClaimVerifyRequestSchema, qqLoginVerifyRequestSchema, randomEventSchema } from "./index";

describe("v1 platform contracts", () => {
  it("validates global and scoped achievement creation", () => {
    const base = { contractVersion: "1" as const, titleKey: "CLASSIC_RACETRACK", titleName: "经典赛道", icon: "trophy", category: "经典版系列", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual" as const, status: "active" as const, gameVersion: "26.0728.1", scope: "map" as const };
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, mapIds: ["map.route66"] }).success).toBe(true);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, mapIds: ["map.route66"], mapVariant: "classic" }).success).toBe(true);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, scope: "global", mapIds: ["map.route66"] }).success).toBe(false);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, titleKey: "not-valid" }).success).toBe(false);
  });
  it("accepts unreleased stable title definitions in the Agents build projection", () => {
    expect(agentTitleListResponseSchema.safeParse({
      contractVersion: "1",
      items: [{ titleKey: "FUTURE_TITLE", label: "未来称号", icon: "trophy", category: "未来系列", condition: "完成挑战", lifecycle: "active", publicVisibility: true, availability: "active", scope: "global", displayKind: "fixed", color: null, gameVersion: null }],
      page: 1,
      pageSize: 20,
      total: 1,
      hasMore: false,
    }).success).toBe(true);
  });
  it("keeps random-event writes to source fields and accepts fractional cooldowns", () => {
    const input = { contractVersion: "1", name: "赌徒：梭哈艺术", category: "机制", description: "事件说明", durationSeconds: 15, cooldownSeconds: 0.32, weight: 0.7, gameVersion: "5.0", effectTags: ["心之钢"], releaseStatus: "implemented", challengeLinks: [] };
    expect(adminRandomEventUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminRandomEventUpdateRequestSchema.safeParse({ ...input, rarity: "SSR" }).success).toBe(false);
    expect(adminRandomEventUpdateRequestSchema.safeParse({ ...input, appearanceProbability: 0.1 }).success).toBe(false);
    expect(randomEventSchema.safeParse({ eventId: "event.test", ...input, eventGroup: "赌徒", rarity: "SR", effectAnnotations: [], archived: false, challenges: [] }).success).toBe(true);
  });
  it("treats the event group as an optional, trimmed write field that clears when empty", () => {
    const input = { contractVersion: "1", name: "事件", category: "机制", description: "说明", durationSeconds: null, cooldownSeconds: null, weight: null, gameVersion: "5.0", effectTags: [], releaseStatus: "implemented", challengeLinks: [] };
    expect(adminRandomEventUpdateRequestSchema.parse(input).eventGroup).toBeUndefined();
    expect(adminRandomEventUpdateRequestSchema.parse({ ...input, eventGroup: "  赌徒  " }).eventGroup).toBe("赌徒");
    expect(adminRandomEventUpdateRequestSchema.parse({ ...input, eventGroup: "   " }).eventGroup).toBeNull();
    expect(adminRandomEventUpdateRequestSchema.parse({ ...input, eventGroup: null }).eventGroup).toBeNull();
    expect(adminRandomEventUpdateRequestSchema.safeParse({ ...input, eventGroup: "x".repeat(65) }).success).toBe(false);
    expect(randomEventSchema.safeParse({ eventId: "event.test", ...input, rarity: "", effectAnnotations: [], archived: false, challenges: [] }).success).toBe(false);
  });
  it("accepts a batch of partial event updates and rejects empty, duplicate, oversized, or unknown ones", () => {
    const update = (eventId: string, extra: Record<string, unknown> = { weight: 1 }) => ({ eventId, ...extra });
    const batch = (updates: unknown[]) => adminRandomEventBatchRequestSchema.safeParse({ contractVersion: "1", updates });
    const parsed = adminRandomEventBatchRequestSchema.parse({ contractVersion: "1", updates: [update("a", { eventGroup: "  ", releaseStatus: "removed" })] });
    expect(parsed.updates[0]).toEqual({ eventId: "a", eventGroup: null, releaseStatus: "removed" });
    expect(batch([]).success).toBe(false);
    expect(batch([{ eventId: "a" }]).success).toBe(false);
    expect(batch([update("a"), update("a")]).success).toBe(false);
    expect(batch([update("a", { rarity: "SSR" })]).success).toBe(false);
    expect(batch([update("a", { challengeLinks: [] })]).success).toBe(false);
    expect(batch(Array.from({ length: 101 }, (_, index) => update(`e${index}`))).success).toBe(false);
    expect(batch(Array.from({ length: 100 }, (_, index) => update(`e${index}`))).success).toBe(true);
  });
  it("validates version-level random-event availability", () => {
    expect(adminRandomEventVersionAvailabilityRequestSchema.safeParse({ contractVersion: "1", availability: "suspended" }).success).toBe(true);
    expect(adminRandomEventVersionAvailabilityRequestSchema.safeParse({ contractVersion: "1", availability: "disabled" }).success).toBe(false);
    expect(adminRandomEventVersionListResponseSchema.safeParse({ contractVersion: "1", items: [{ gameVersion: "26.0901.1", availability: "available", mode: null, eventCount: 2 }] }).success).toBe(true);
  });
  it("accepts stable QQ binding metadata", () => {
    expect(qqBindingRequestSchema.safeParse({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "user-1", playerName: "Player", playerId: "1234" }).success).toBe(true);
  });

  it("validates the administrator BattleTag name update contract", () => {
    expect(adminPlayerIdentityRequestSchema.safeParse({ contractVersion: "1", playerName: "新名称" }).success).toBe(true);
    expect(adminPlayerIdentityRequestSchema.safeParse({ contractVersion: "1", playerName: "   " }).success).toBe(false);
  });

  it("keeps challenge qualification canonical and complete OCR field review explicit", () => {
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "achievement_titles", reviewedValue: "HERO、SECOND" }] }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "difficulty", reviewedValue: "一般" }] }).success).toBe(true);
    const everyField = ["map_name", "difficulty", "viewer_player", "challenge_completed", "map_variant", "mode", "achievement_titles", "version", "run_code", "duration_seconds", "deaths", "skips"];
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: everyField.map((fieldKey) => ({ fieldKey, reviewedValue: "1" })) }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "difficulty", reviewedValue: "一般" }, { fieldKey: "difficulty", reviewedValue: "困难" }] }).success).toBe(false);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", confirmedChallengeIds: ["legacy:title_challenge:title.hero:::abc"] }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", confirmedChallengeIds: ["challenge.a", "challenge.a"] }).success).toBe(false);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected", confirmedChallengeIds: ["challenge.a"] }).success).toBe(false);
    expect(adminSubmissionReviewPreviewRequestSchema.safeParse({ contractVersion: "1", confirmedChallengeIds: ["challenge.a"], fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "国王大道" }] }).success).toBe(true);
    expect(adminSubmissionReviewPreviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved" }).success).toBe(false);
  });

  it("rejects an unversioned contract", () => {
    expect(qqBindingRequestSchema.safeParse({ contractVersion: "2", provider: "qq", groupOpenId: "group-1", memberOpenId: "user-1", playerName: "Player", playerId: "1234" }).success).toBe(false);
  });

  it("accepts QQ binding claim verification without treating QQ as Portal authentication", () => {
    expect(qqBindingClaimVerifyRequestSchema.safeParse({ contractVersion: "1", provider: "qq", code: "ABC234", groupOpenId: "group-1", memberOpenId: "user-1", messageId: "message-1" }).success).toBe(true);
  });

  it("resolves invitation identity from the invitation code", () => {
    expect(bindingInviteRedeemRequestSchema.safeParse({ contractVersion: "1", code: "ABCDEFGHIJKL" }).success).toBe(true);
    expect(bindingInviteRedeemRequestSchema.safeParse({ contractVersion: "1", code: "ABCDEFGHIJKL", playerName: "Changed", playerId: "9999" }).success).toBe(false);
    expect(bindingInviteRedeemResponseSchema.safeParse({ contractVersion: "1", claimId: "00000000-0000-4000-8000-000000000008", claimToken: "a".repeat(64), code: "ABC234", playerName: "Player", playerId: "1234", expiresAt: 1 }).success).toBe(true);
  });

  it("accepts a player response without QQ identifiers", () => {
    expect(currentPlayerResponseSchema.safeParse({ contractVersion: "1", player: { playerId: "1234", playerName: "Player", isAdmin: false }, recentSubmissions: [] }).success).toBe(true);
  });

  it("keeps player mastery responses limited to safe active projections and private history state", () => {
    const run = { runId: "00000000-0000-4000-8000-000000000010", mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", gameplayRevisionLifecycle: "default", mapVariant: null, difficulty: "困难", completionDurationSeconds: 600, deaths: 2, skips: 1, awardedXp: 225, acceptedAt: 1_000, status: "active" };
    const response = {
      contractVersion: "1",
      profiles: [{ mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", gameplayRevisionLifecycle: "default", totalXp: 225, verifiedRunCount: 1, difficultyStats: [{ difficulty: "困难", verifiedRunCount: 1, fastestCompletionSeconds: 600 }], lowestDeaths: 2, fewestSkips: 1, highestSingleRunXp: 225, highestCompletedDifficulty: "困难", recentRuns: [run] }],
      runs: [run],
      page: 1,
      pageSize: 20,
      total: 1,
      hasMore: false,
    };
    expect(currentPlayerMasteryResponseSchema.safeParse(response).success).toBe(true);
    expect(currentPlayerMasteryResponseSchema.safeParse({ ...response, runs: [{ ...run, status: "invalidated" }] }).success).toBe(true);
    expect(currentPlayerMasteryResponseSchema.safeParse({ ...response, runs: [{ ...run, matchCode: "1234-5678-9012" }] }).success).toBe(false);
    expect(currentPlayerMasteryResponseSchema.safeParse({ ...response, profiles: [{ ...response.profiles[0], recentRuns: [{ ...run, sourceSubmissionId: "00000000-0000-4000-8000-000000000011" }] }] }).success).toBe(false);
  });

  it("accepts v1 history and v2 Verified Run facts while requiring an auditable correction", () => {
    const run = {
      runId: "00000000-0000-4000-8000-000000000001",
      playerAccountId: "00000000-0000-4000-8000-000000000002",
      playerId: "1234",
      playerName: "Player",
      sourceSubmissionId: "00000000-0000-4000-8000-000000000003",
      mapId: "map.test",
      mapName: "Test",
      gameplayRevisionId: "revision:map.test:initial",
      gameplayRevisionLifecycle: "default",
      mapVariant: null,
      difficulty: "困难",
      gameVersion: "26.0810.1",
      matchCode: "1234-5678-9012",
      completionDurationSeconds: 600,
      deaths: 1,
      skips: 0,
      eventCounters: {},
      acceptanceSource: "submission_review",
      acceptedAt: 1,
      status: "active",
      invalidatedAt: null,
      invalidatedBy: null,
      invalidationReason: null,
      xpRuleVersion: "v1",
      xpInputSnapshot: { ruleVersion: "v1", baseDifficultyXp: 225, mapFactor: 1, performanceBonus: 0.05, performanceBonusReasons: ["no_skips"], challengeBonus: 0 },
      awardedXp: 236,
      conflictCount: 0,
    };
    expect(adminVerifiedRunSchema.safeParse(run).success).toBe(true);
    expect(adminVerifiedRunSchema.safeParse({ ...run, xpRuleVersion: "v2", xpInputSnapshot: { ruleVersion: "v2", baseDifficultyXp: 225, mapFactor: 1, performanceBonus: 0.05, performanceBonusReasons: ["no_skips"] } }).success).toBe(true);
    expect(adminVerifiedRunSchema.safeParse({ ...run, xpRuleVersion: "v2" }).success).toBe(false);
    expect(adminVerifiedRunCorrectionRequestSchema.safeParse({ contractVersion: "1", changes: { mapId: "map.next" }, reason: "来自原始截图" }).success).toBe(false);
    expect(adminVerifiedRunCorrectionRequestSchema.safeParse({ contractVersion: "1", changes: { deaths: null }, reason: "依据原始截图复核" }).success).toBe(true);
    expect(adminVerifiedRunCorrectionRequestSchema.safeParse({ contractVersion: "1", changes: { deaths: 0 } }).success).toBe(true);
    expect(adminVerifiedRunCorrectionRequestSchema.safeParse({ contractVersion: "1", changes: { deaths: 0 }, reason: "" }).success).toBe(false);
  });

  it("keeps player review contracts limited to current-review fields", () => {
    const review = { reviewId: "00000000-0000-4000-8000-000000000003", targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 4, comment: "很好", anonymous: true, createdAt: 1, updatedAt: 2 };
    expect(playerReviewUpsertRequestSchema.safeParse({ contractVersion: "1", rating: 4, comment: "很好", anonymous: true }).success).toBe(true);
    expect(playerReviewUpsertRequestSchema.safeParse({ contractVersion: "1", rating: 6 }).success).toBe(false);
    expect(playerReviewUpsertRequestSchema.safeParse({ contractVersion: "1", rating: 4, comment: "中".repeat(501) }).success).toBe(false);
    expect(playerReviewUpsertResponseSchema.safeParse({ contractVersion: "1", review }).success).toBe(true);
    expect(playerReviewUpsertResponseSchema.safeParse({ contractVersion: "1", review: { ...review, targetType: "event", targetId: "event.test", gameplayRevisionId: null } }).success).toBe(true);
    expect(playerReviewResponseSchema.safeParse({ contractVersion: "1", review: null }).success).toBe(true);
    expect(playerReviewWithdrawRequestSchema.safeParse({ contractVersion: "1" }).success).toBe(true);
    expect(playerReviewWithdrawResponseSchema.safeParse({ contractVersion: "1", review: null }).success).toBe(true);
  });

  it("keeps public review contracts privacy-safe and bounded", () => {
    const summary = { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", averageRating: 4.25, reviewCount: 4, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 }, sampleInsufficient: false };
    expect(publicReviewSummaryResponseSchema.safeParse({ contractVersion: "1", summary }).success).toBe(true);
    expect(publicReviewSummaryResponseSchema.safeParse({ contractVersion: "1", summary: { ...summary, targetType: "event", targetId: "event.test", gameplayRevisionId: null } }).success).toBe(true);
    expect(publicReviewSummaryResponseSchema.safeParse({ contractVersion: "1", summary: { ...summary, gameplayRevisionId: null } }).success).toBe(false);
    expect(publicReviewCommentPageSchema.safeParse({ contractVersion: "1", targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", items: [{ rating: 5, comment: "很好", author: null, createdAt: 1 }, { rating: 4, comment: "稳定", author: { displayName: "公开玩家" }, createdAt: 2 }], page: 1, pageSize: 20, total: 2, hasMore: false }).success).toBe(true);
    expect(publicReviewCommentPageSchema.safeParse({ contractVersion: "1", targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", items: [{ rating: 5, comment: "很好", author: { displayName: "公开玩家", playerId: "1234" }, createdAt: 1 }], page: 1, pageSize: 20, total: 1, hasMore: false }).success).toBe(false);
  });

  it("accepts player OCR summaries without raw recognition output", () => {
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "needs_review", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "processing", mapName: "成就挑战", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true, achievementTitles: ["守望先锋"] } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "completed", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true, modelVersion: "ocr-v3" } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "rejected", resubmissionRequired: true, mapName: "测试地图", createdAt: 1, updatedAt: 2, manualReviewEligible: true }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "completed", mapName: "测试地图", createdAt: 1, updatedAt: 2, verifiedRunOutcome: { status: "created", awardedXp: 225 } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "rejected", mapName: "测试地图", createdAt: 1, updatedAt: 2, verifiedRunOutcome: { status: "reused", awardedXp: 0, reason: "private" } }).success).toBe(false);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "ocr_review_required", mapName: "测试地图", createdAt: 1, updatedAt: 2 }).success).toBe(false);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "needs_review", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { responseJson: {} } }).success).toBe(false);
  });

  it("keeps legacy submission states visible in the admin contract", () => {
    expect(adminSubmissionSchema.safeParse({ submissionId: "00000000-0000-4000-8000-000000000003", status: "ocr_pending", challengeId: "map.test", challenge: null, mapName: "测试地图", difficulty: "困难", playerAccountId: "11111111-1111-4111-8111-111111111111", playerName: "Player", createdAt: 1, updatedAt: 2, ocrStatus: "not_started", ocrAttempt: null, ocrErrorCode: null, ocr: null, evidenceUrl: "https://api.example.com/evidence" }).success).toBe(true);
  });

  it("includes resolved challenge detail on admin player recent submissions", () => {
    const base = {
      submissionId: "00000000-0000-4000-8000-000000000003",
      status: "completed",
      mapName: "釜山",
      createdAt: 1,
      updatedAt: 2,
    };
    expect(adminPlayerDetailSchema.safeParse({
      playerAccountId: "11111111-1111-4111-8111-111111111111",
      playerId: "1234",
      playerName: "Player",
      status: "active",
      bindingCount: 1,
      updatedAt: 2,
      bindings: [],
      recentSubmissions: [
        { ...base, challengeId: "map.busan.hell", difficulty: "地狱", challenge: { family: "map", name: "釜山 地狱", mapName: "釜山", difficulty: "地狱" } },
        { ...base, submissionId: "00000000-0000-4000-8000-000000000004", mapName: "成就挑战", challenge: { family: "achievement", titleName: "钢门", category: "传奇系列", condition: "完成挑战", evidenceRule: "完整截图" } },
      ],
      recentCompletions: [],
      progression: { activeVerifiedRunCount: 0, recentVerifiedRuns: [] },
      titleGrants: [],
    }).success).toBe(true);
  });

  it("validates the single-image portal upload without a challenge selector", () => {
    const upload = { contractVersion: "1", contentType: "image/png", byteSize: 1024, sha256: "a".repeat(64) };
    expect(playerUploadSessionRequestSchema.safeParse(upload).success).toBe(true);
    expect(playerUploadSessionRequestSchema.safeParse({ ...upload, challengeId: "map.samoa.hell" }).success).toBe(false);
    expect(playerUploadSessionRequestSchema.safeParse({ ...upload, contentType: "application/pdf" }).success).toBe(false);
  });

  it("requires a gameplay revision on every map challenge projection", () => {
    const challenge = { challengeId: "map.samoa.hell", family: "map", type: "map_completion", kind: "difficulty_completion", name: "地狱难度通关", mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0810.1", status: "active" };
    expect(mapChallengeSchema.safeParse(challenge).success).toBe(false);
    expect(mapChallengeSchema.safeParse({ ...challenge, gameplayRevisionId: "revision:map.samoa:rework" }).success).toBe(true);
  });

  it("validates only explicit, finite, revision-owned spatial projections", () => {
    const spatialConfig = {
      bastionPositions: [[1, 2, 3]],
      resetPosition: [4, 5, 6],
      endPosition: [7, 8, 9],
      thirdPersonPosition: [10, 11, 12],
      creditsPosition: [13, 14, 15],
      control: null,
      portalPositions: [],
      springboardPositions: [],
    } as const;
    const revision = {
      gameplayRevisionId: "revision:map.samoa:initial",
      mapId: "map.samoa",
      mapVariant: null,
      lifecycle: "default",
      enabled: true,
      isDefault: true,
      isSelectable: false,
      gameVersion: "26.0810.1",
      spatialConfig,
      challengeRefs: [{ family: "map", challengeId: "map.samoa.hell" }],
    } as const;
    expect(agentSpatialConfigSchema.safeParse(spatialConfig).success).toBe(true);
    expect(agentSpatialConfigSchema.parse(spatialConfig)).toMatchObject({ alternateStages: [] });
    expect(agentMapSchema.safeParse({ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0810.1", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [revision] }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, endPosition: [Number.POSITIVE_INFINITY, 0, 0] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, control: { centerPositions: [], jumpPositions: [[0, 0, 0]], respawnPositions: [[0, 0, 0], [1, 1, 1]], respawnAxis: "x", respawnAxisThreshold: 1 } }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, control: { centerPositions: [[0, 0, 0]], jumpPositions: [], respawnPositions: [], respawnAxis: "x", respawnAxisThreshold: 1 } }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, control: { centerPositions: [[0, 0, 0]], jumpPositions: [], respawnPositions: [[0, 0, 0]], respawnAxis: null, respawnAxisThreshold: 1 } }).success).toBe(false);
    const alternateStage = { stageId: "ruins", setupDetection: { position: [16, 17, 18], radius: 30 }, ...spatialConfig } as const;
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, alternateStages: [alternateStage] }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, alternateStages: [{ ...alternateStage, setupDetection: { position: [16, 17, 18], radius: 0 } }] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, alternateStages: [alternateStage, alternateStage] }).success).toBe(false);
    const compositeStage = (stageId: string, offset: number, setupDetection?: { position: [number, number, number]; radius: number }) => ({
      stageId,
      ...(setupDetection ? { setupDetection } : {}),
      ...spatialConfig,
      bastionPositions: [[offset, offset + 1, offset + 2]],
    });
    const composite = {
      composition: {
        selectionCount: 2,
        firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
        remainingStageSelection: "random_unique",
      },
      stages: [
        compositeStage("base", 1),
        compositeStage("icebreaker", 10, { position: [20, 21, 22], radius: 30 }),
        compositeStage("laboratory", 30, { position: [40, 41, 42], radius: 30 }),
      ],
    } as const;
    expect(agentSpatialConfigSchema.safeParse(composite).success).toBe(true);
    expect(agentProjectedSpatialConfigSchema.safeParse(composite).success).toBe(false);
    expect(agentMapSchema.safeParse({ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0810.1", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [{ ...revision, spatialConfig: composite }] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...composite, composition: { ...composite.composition, selectionCount: 4 } }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...composite, composition: { ...composite.composition, firstStageSelection: { mode: "setup_detection", fallbackStageId: "missing" } } }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...composite, stages: [composite.stages[0], composite.stages[1], { ...composite.stages[2], stageId: "icebreaker" }] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...composite, stages: [composite.stages[0], { ...composite.stages[1], setupDetection: undefined }, composite.stages[2]] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...composite, stages: [{ ...composite.stages[0], setupDetection: { position: [2, 3, 4], radius: 30 } }, composite.stages[1], composite.stages[2]] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...composite, stages: [composite.stages[0], { ...composite.stages[1], setupDetection: { position: [20, 21, 22], radius: 0 } }, composite.stages[2]] }).success).toBe(false);
    const sharedComposite = {
      resetPosition: [4, 5, 6],
      endPosition: [7, 8, 9],
      thirdPersonPosition: [10, 11, 12],
      creditsPosition: [13, 14, 15],
      control: { respawnAxis: "x", respawnAxisThreshold: 40 },
      composition: composite.composition,
      stages: [
        { stageId: "base", bastionPositions: [[1, 2, 3]], control: { centerPositions: [[4, 5, 6]], jumpPositions: [[7, 8, 9]], respawnPositions: [[10, 11, 12]] }, portalPositions: [], springboardPositions: [] },
        { stageId: "icebreaker", setupDetection: { position: [20, 21, 22], radius: 30 }, bastionPositions: [[10, 11, 12]], control: { centerPositions: [], jumpPositions: [[13, 14, 15]], respawnPositions: [[16, 17, 18]] }, portalPositions: [[19, 20, 21]], springboardPositions: [] },
        { stageId: "laboratory", setupDetection: { position: [40, 41, 42], radius: 30 }, bastionPositions: [[30, 31, 32]], control: { centerPositions: [], jumpPositions: [[44, 45, 46]], respawnPositions: [[47, 48, 49]] }, portalPositions: [], springboardPositions: [[43, 44, 45]] },
      ],
    } as const;
    const stageIdCycleComposite = {
      ...sharedComposite,
      composition: { ...sharedComposite.composition, remainingStageSelection: "stage_id_cycle" },
    } as const;
    expect(agentSpatialConfigSchema.safeParse(sharedComposite).success).toBe(true);
    expect(agentProjectedSpatialConfigSchema.safeParse(sharedComposite).success).toBe(true);
    expect(agentMapSchema.safeParse({ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0810.1", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [{ ...revision, spatialConfig: sharedComposite }] }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse(stageIdCycleComposite).success).toBe(true);
    expect(agentProjectedSpatialConfigSchema.safeParse(stageIdCycleComposite).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...composite, composition: { ...composite.composition, remainingStageSelection: "stage_id_cycle" } }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: [{ ...sharedComposite.stages[0]!, control: { ...sharedComposite.stages[0]!.control!, jumpPositions: [[7, 8, 9], [8, 9, 10]], respawnPositions: [[10, 11, 12]] } }, ...sharedComposite.stages.slice(1)] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: [{ ...sharedComposite.stages[0]!, control: { ...sharedComposite.stages[0]!.control!, jumpPositions: [[7, 8, 9], [8, 9, 10]], respawnPositions: [[10, 11, 12], [11, 12, 13]] } }, ...sharedComposite.stages.slice(1)] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, control: { respawnAxis: "x", respawnAxisThreshold: null } }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, control: { respawnAxis: "x", respawnAxisThreshold: -1 } }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: sharedComposite.stages.map((stage) => ({ ...stage, control: null })) }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: [{ ...sharedComposite.stages[0]!, control: { centerPositions: [], jumpPositions: [], respawnPositions: [] } }, ...sharedComposite.stages.slice(1)] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: [{ ...sharedComposite.stages[0]!, endPosition: [50, 51, 52] }, ...sharedComposite.stages.slice(1)] }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: [{ ...sharedComposite.stages[0]!, endPosition: [50, 51] }, ...sharedComposite.stages.slice(1)] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: [{ ...sharedComposite.stages[0]!, resetPosition: [50, 51, Number.NaN] }, ...sharedComposite.stages.slice(1)] }).success).toBe(false);
    // Busan cyclic routes (Bastion b4b40ea): each route's reset/third-person/credits come from its first stage and its end from its last stage.
    const busanStage = (stageId: string, anchors: { reset: number[]; thirdPerson: number[]; credits: number[]; end: number[] }, offset: number, setupDetection: { position: [number, number, number]; radius: number }) => ({
      stageId,
      setupDetection,
      resetPosition: anchors.reset,
      thirdPersonPosition: anchors.thirdPerson,
      creditsPosition: anchors.credits,
      endPosition: anchors.end,
      bastionPositions: [[offset, 1, 1]],
      control: { centerPositions: [], jumpPositions: [[offset, 2, 2]], respawnPositions: [[offset, 3, 3]] },
      portalPositions: [],
      springboardPositions: [],
    });
    const busan = {
      ...sharedComposite,
      composition: { selectionCount: 2, firstStageSelection: { mode: "setup_detection", fallbackStageId: "stage_0" }, remainingStageSelection: "stage_id_cycle" },
      stages: [
        { ...busanStage("stage_0", { reset: [-409.71, 10.11, 165.61], thirdPerson: [-410.4, 10.11, 162.37], credits: [-426.04, 13.11, 165.81], end: [-251.99, 11.34, 174.77] }, 1, { position: [0, 0, 0], radius: 30 }), setupDetection: undefined },
        busanStage("stage_1", { reset: [-30.05, 17, -118.12], thirdPerson: [-30.05, 17, -133.42], credits: [-43.73, 19, -125.54], end: [104.77, 17.74, -137.21] }, 2, { position: [1, 1, 1], radius: 30 }),
        busanStage("stage_2", { reset: [282.34, 12.1, 201.72], thirdPerson: [289.73, 12.1, 199.05], credits: [297.09, 14.1, 208.95], end: [158.67, 10.81, 260.91] }, 3, { position: [2, 2, 2], radius: 30 }),
      ],
    };
    const parsedBusan = agentProjectedSpatialConfigSchema.parse(busan);
    if (!("stages" in parsedBusan) || !("composition" in parsedBusan)) throw new Error("expected composite");
    expect(parsedBusan.stages.map((stage) => stage.resetPosition)).toEqual([[-409.71, 10.11, 165.61], [-30.05, 17, -118.12], [282.34, 12.1, 201.72]]);
    expect(parsedBusan.stages.map((stage) => stage.endPosition)).toEqual([[-251.99, 11.34, 174.77], [104.77, 17.74, -137.21], [158.67, 10.81, 260.91]]);
    expect(agentSpatialConfigSchema.safeParse({ ...sharedComposite, stages: [{ ...sharedComposite.stages[0]!, control: { centerPositions: [], jumpPositions: [], respawnPositions: [], respawnAxis: "x", respawnAxisThreshold: 40 } }, ...sharedComposite.stages.slice(1)] }).success).toBe(false);
    expect(agentMapSchema.safeParse({ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0810.1", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [{ ...revision, lifecycle: "selectable", isDefault: true, isSelectable: true }] }).success).toBe(false);
  });

  it("allows review decisions without requiring a reason", () => {
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", reason: "截图与 OCR 结果一致" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected", reason: "" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected" }).success).toBe(true);
  });

  it("keeps reset reasons optional and allows an automatic or administrator-defined game version", () => {
    const input = { contractVersion: "1" as const, sourceRevisionId: "revision:map.busan:initial", mapVariant: null, copyConfiguration: true };
    expect(adminMapRevisionCreateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminMapRevisionCreateRequestSchema.parse({ ...input, resetReason: "  " }).resetReason).toBeNull();
    expect(adminMapRevisionCreateRequestSchema.safeParse({ ...input, gameVersion: "2099.01.01" }).success).toBe(true);

    const update = { contractVersion: "1" as const, lifecycle: "preparing" as const, gameVersion: "2099.01.01", mapVariant: null, spatialConfig: null, challengeAssignments: [] };
    expect(adminMapRevisionUpdateRequestSchema.safeParse(update).success).toBe(true);
    expect(adminMapRevisionUpdateRequestSchema.safeParse({ ...update, gameVersion: "  " }).success).toBe(false);
    expect(adminMapRevisionPromotionRequestSchema.safeParse({ contractVersion: "1", replacedDefaultLifecycle: "selectable" }).success).toBe(true);
    expect(adminMapRevisionPromotionRequestSchema.safeParse({ contractVersion: "1", replacedDefaultLifecycle: null, lifecycle: "default" }).success).toBe(false);
  });

  it("requires a non-empty optional reason for manual title grants", () => {
    const input = { contractVersion: "1", playerAccountId: "11111111-1111-4111-8111-111111111111", titleKey: "TITLE" };
    expect(adminManualTitleGrantRequestSchema.safeParse(input).success).toBe(true);
    expect(adminManualTitleGrantRequestSchema.safeParse({ ...input, reason: "" }).success).toBe(false);
  });

  it("validates achievement update fields without requiring optional lifecycle metadata", () => {
    const input = { contractVersion: "1", family: "achievement", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "retired" };
    expect(adminChallengeUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, iconUrl: "https://cdn.example.com/icon.webp" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, iconUrl: "not-a-url" }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, retiredVersion: "26.0713.1" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, status: "sunsetting" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, status: "sunsetting", retiredVersion: "26.0713.2" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, retiredVersion: "2026.07.16" }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, gameVersion: null }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ contractVersion: "1", family: "map", status: "retired" }).success).toBe(true);
  });

  it("keeps Pioneer rules limited to explicit map exceptions", () => {
    const rule = { contractVersion: "1", titleKey: "PIONEER", kind: "pioneer", condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual", displayKind: "map_pioneer", slot: "pioneer", status: "active", introducedVersion: "2026.07.15", retiredVersion: null } as const;
    expect(adminMapTitleRuleCreateRequestSchema.safeParse({ ...rule, defaultScope: "all_active" }).success).toBe(false);
    expect(adminMapTitleRuleCreateRequestSchema.safeParse({ ...rule, defaultScope: "explicit" }).success).toBe(true);
  });

  it("accepts null optional fields from an admin response when editing a challenge", () => {
    const title = { contractVersion: "1", family: "achievement", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, iconUrl: null, status: "active", retiredVersion: null, startsAt: null, endsAt: null };
    expect(adminChallengeUpdateRequestSchema.safeParse(title).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ contractVersion: "1", family: "map", status: "active", retiredVersion: null }).success).toBe(true);
  });

  it("accepts scheduled title challenges without a time window", () => {
    const input = { contractVersion: "1", family: "achievement", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", startsAt: 2_000, endsAt: 3_000 };
    expect(adminChallengeUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, endsAt: 1_000 }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, startsAt: undefined, endsAt: undefined }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, startsAt: undefined }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, startsAt: undefined, endsAt: undefined, gameVersion: null }).success).toBe(true);
  });

  it("allows a future achievement to omit release metadata", () => {
    const input = { contractVersion: "1", titleKey: "FUTURE_TITLE", titleName: "未来称号", icon: "trophy", category: "未来系列", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", scope: "global", mapIds: [], status: "scheduled" };
    expect(adminAchievementCreateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...input, status: "active" }).success).toBe(false);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...input, status: "sunsetting", retiredVersion: "26.0901.1" }).success).toBe(false);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...input, status: "retired" }).success).toBe(false);
    expect(adminChallengeSchema.safeParse({ challengeId: "title.FUTURE_TITLE", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FUTURE_TITLE", titleName: "未来称号", icon: "trophy", category: "未来系列", condition: "完成挑战", evidenceRule: "完整截图", gameVersion: null, status: "scheduled", introducedVersion: null, submissionMode: "manual", categoryOverride: null, retiredVersion: null, startsAt: null, endsAt: null }).success).toBe(true);
  });

  it("validates complete catalog-title challenge edits", () => {
    const input = { contractVersion: "1", status: "scheduled", label: "内部称号", icon: "wrench", category: "开发保留", scope: "global", displayKind: "fixed", color: { kind: "palette", name: "blue" }, condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, startsAt: 2_000, endsAt: 3_000 };
    expect(adminCatalogTitleUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminCatalogTitleUpdateRequestSchema.safeParse({ ...input, endsAt: 1_000 }).success).toBe(false);
    expect(adminCatalogTitleUpdateRequestSchema.safeParse({ contractVersion: "1", status: "active", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, startsAt: 2_000, endsAt: 3_000 }).success).toBe(false);
  });

  it("keeps historical retirement version records readable", () => {
    expect(adminChallengeSchema.safeParse({ challengeId: "map.test", family: "map", gameplayRevisionId: "revision:map.test:initial", type: "map_completion", kind: "difficulty_completion", name: "测试挑战", mapId: "map.test", mapName: "测试地图", gameVersion: "2026.07.15", status: "retired", introducedVersion: "2026.07.15", retiredVersion: "2026.07.16" }).success).toBe(true);
    expect(adminChallengeSchema.safeParse({ challengeId: "title.CLASSIC", family: "map", gameplayRevisionId: "revision:map.circuit_royal:v0", type: "map_completion", kind: "map_title_achievement", titleKey: "CLASSIC", name: "老兵", mapId: "map.circuit_royal", mapName: "皇家赛道", gameVersion: "2026.07.29", status: "active", introducedVersion: "2026.07.29", retiredVersion: null }).success).toBe(true);
  });

  it("keeps player OCR feedback to a bounded screenshot-level mark", () => {
    const feedback = { ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" };
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "completed", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true }, feedback }).success).toBe(true);
    // No marks before feedback exists, and no transcription/internal fields are part of the projection.
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "completed", mapName: "测试地图", createdAt: 1, updatedAt: 2, feedback: { ...feedback, accuracy: null } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "completed", mapName: "测试地图", createdAt: 1, updatedAt: 2, feedback: { ...feedback, accuracy: "confirmed" } }).success).toBe(false);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "completed", mapName: "测试地图", createdAt: 1, updatedAt: 2, feedback: { ...feedback, proposedValue: "一般" } }).success).toBe(false);
  });

  it("validates screenshot-level OCR accuracy marks for players and maintainers", () => {
    expect(ocrAccuracyFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate" }).success).toBe(true);
    expect(ocrAccuracyFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate" }).success).toBe(true);
    // The mark accepts no transcription content.
    expect(ocrAccuracyFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "confirmed" }).success).toBe(false);
    expect(ocrAccuracyFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004" }).success).toBe(false);
    expect(ocrAccuracyFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "accurate", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }).success).toBe(false);
    expect(ocrAccuracyFeedbackResponseSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", ocrResultId: "00000000-0000-4000-8000-000000000004", accuracy: "inaccurate", alreadySubmitted: false }).success).toBe(true);
  });
});
