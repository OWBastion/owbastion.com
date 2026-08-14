import { describe, expect, it } from "vitest";
import { adminAchievementCreateRequestSchema, adminAnnotationDecisionRequestSchema, adminAnnotationDecisionResponseSchema, adminAnnotationDirectCreateRequestSchema, adminAnnotationDirectCreateResponseSchema, adminAnnotationProposalListResponseSchema, adminAnnotationProposalSchema, adminCatalogTitleUpdateRequestSchema, adminChallengeSchema, adminChallengeUpdateRequestSchema, adminDatasetCreateRequestSchema, adminDatasetCreateResponseSchema, adminDatasetDetailResponseSchema, adminDatasetFinalizeRequestSchema, adminDatasetFinalizeResponseSchema, adminDatasetListResponseSchema, adminMapRevisionCreateRequestSchema, adminMapRevisionUpdateRequestSchema, adminMapTitleRuleCreateRequestSchema, adminManualTitleGrantRequestSchema, adminPlayerDetailSchema, adminPlayerIdentityRequestSchema, adminRandomEventUpdateRequestSchema, adminReviewedAnnotationSchema, adminSubmissionChallengeRequestSchema, adminSubmissionReviewRequestSchema, adminSubmissionSchema, agentMapSchema, agentSpatialConfigSchema, bindingInviteRedeemRequestSchema, bindingInviteRedeemResponseSchema, currentPlayerMasteryResponseSchema, currentPlayerResponseSchema, mapChallengeSchema, ocrkitDatasetResponseSchema, playerOcrFeedbackRequestSchema, playerOcrFeedbackResponseSchema, playerReviewResponseSchema, playerReviewUpsertRequestSchema, playerReviewUpsertResponseSchema, playerReviewWithdrawRequestSchema, playerReviewWithdrawResponseSchema, playerSubmissionDetailSchema, playerUploadSessionRequestSchema, publicReviewCommentPageSchema, publicReviewSummaryBatchResponseSchema, publicReviewSummaryResponseSchema, qqBindingRequestSchema, qqLoginVerifyRequestSchema, randomEventSchema, submissionRequestSchema } from "./index";

describe("v1 platform contracts", () => {
  it("validates global and scoped achievement creation", () => {
    const base = { contractVersion: "1" as const, titleKey: "CLASSIC_RACETRACK", titleName: "经典赛道", icon: "trophy", category: "经典版系列", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual" as const, status: "active" as const, gameVersion: "26.0728.1", scope: "map" as const };
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, mapIds: ["map.route66"] }).success).toBe(true);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, mapIds: ["map.route66"], mapVariant: "classic" }).success).toBe(true);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, scope: "global", mapIds: ["map.route66"] }).success).toBe(false);
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, titleKey: "not-valid" }).success).toBe(false);
  });
  it("keeps random-event writes to source fields and accepts fractional cooldowns", () => {
    const input = { contractVersion: "1", name: "赌徒：梭哈艺术", category: "机制", rarity: "SR", description: "事件说明", durationSeconds: 15, cooldownSeconds: 0.32, weight: 0.7, gameVersion: "5.0", effectTags: ["心之钢"], releaseStatus: "implemented", challengeLinks: [] };
    expect(adminRandomEventUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminRandomEventUpdateRequestSchema.safeParse({ ...input, appearanceProbability: 0.1 }).success).toBe(false);
    expect(randomEventSchema.safeParse({ eventId: "event.test", ...input, effectAnnotations: [], archived: false, challenges: [] }).success).toBe(true);
  });
  it("accepts stable QQ binding metadata", () => {
    expect(qqBindingRequestSchema.safeParse({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "user-1", playerName: "Player", playerId: "1234" }).success).toBe(true);
  });

  it("validates the administrator BattleTag name update contract", () => {
    expect(adminPlayerIdentityRequestSchema.safeParse({ contractVersion: "1", playerName: "新名称" }).success).toBe(true);
    expect(adminPlayerIdentityRequestSchema.safeParse({ contractVersion: "1", playerName: "   " }).success).toBe(false);
  });

  it("rejects a submission without evidence metadata", () => {
    expect(submissionRequestSchema.safeParse({ contractVersion: "1", actor: { provider: "qq", groupOpenId: "group-1", memberOpenId: "user-1" }, challenge: { type: "map_completion", mapName: "Test Map" }, source: { provider: "qq", conversationId: "group-1", messageId: "message-1" }, attachments: [] }).success).toBe(false);
  });

  it("rejects an unversioned contract", () => {
    expect(qqBindingRequestSchema.safeParse({ contractVersion: "2", provider: "qq", groupOpenId: "group-1", memberOpenId: "user-1", playerName: "Player", playerId: "1234" }).success).toBe(false);
  });

  it("accepts the QQ login verification contract", () => {
    expect(qqLoginVerifyRequestSchema.safeParse({ contractVersion: "1", provider: "qq", code: "ABC234", groupOpenId: "group-1", memberOpenId: "user-1", messageId: "message-1" }).success).toBe(true);
  });

  it("resolves invitation identity from the invitation code", () => {
    expect(bindingInviteRedeemRequestSchema.safeParse({ contractVersion: "1", code: "ABCDEFGHIJKL" }).success).toBe(true);
    expect(bindingInviteRedeemRequestSchema.safeParse({ contractVersion: "1", code: "ABCDEFGHIJKL", playerName: "Changed", playerId: "9999" }).success).toBe(false);
    expect(bindingInviteRedeemResponseSchema.safeParse({ contractVersion: "1", claimId: "00000000-0000-4000-8000-000000000008", claimToken: "a".repeat(64), code: "ABC234", playerName: "Player", playerId: "1234", expiresAt: 1 }).success).toBe(true);
  });

  it("accepts a player response without QQ identifiers", () => {
    expect(currentPlayerResponseSchema.safeParse({ contractVersion: "1", player: { playerId: "1234", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] }).success).toBe(true);
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
    expect(currentPlayerMasteryResponseSchema.safeParse({ ...response, runs: [{ ...run, runCode: "1234-5678-9012" }] }).success).toBe(false);
    expect(currentPlayerMasteryResponseSchema.safeParse({ ...response, profiles: [{ ...response.profiles[0], recentRuns: [{ ...run, sourceSubmissionId: "00000000-0000-4000-8000-000000000011" }] }] }).success).toBe(false);
  });

  it("keeps player review contracts limited to current-review fields", () => {
    const review = { reviewId: "00000000-0000-4000-8000-000000000003", targetType: "map", targetId: "map.test", rating: 4, comment: "很好", anonymous: true, createdAt: 1, updatedAt: 2 };
    expect(playerReviewUpsertRequestSchema.safeParse({ contractVersion: "1", rating: 4, comment: "很好", anonymous: true }).success).toBe(true);
    expect(playerReviewUpsertRequestSchema.safeParse({ contractVersion: "1", rating: 6 }).success).toBe(false);
    expect(playerReviewUpsertRequestSchema.safeParse({ contractVersion: "1", rating: 4, comment: "中".repeat(501) }).success).toBe(false);
    expect(playerReviewUpsertResponseSchema.safeParse({ contractVersion: "1", review }).success).toBe(true);
    expect(playerReviewResponseSchema.safeParse({ contractVersion: "1", review: null }).success).toBe(true);
    expect(playerReviewWithdrawRequestSchema.safeParse({ contractVersion: "1" }).success).toBe(true);
    expect(playerReviewWithdrawResponseSchema.safeParse({ contractVersion: "1", review: null }).success).toBe(true);
  });

  it("keeps public review contracts privacy-safe and bounded", () => {
    const summary = { targetType: "map", targetId: "map.test", averageRating: 4.25, reviewCount: 4, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 }, sampleInsufficient: false };
    expect(publicReviewSummaryResponseSchema.safeParse({ contractVersion: "1", summary }).success).toBe(true);
    expect(publicReviewSummaryBatchResponseSchema.safeParse({ contractVersion: "1", targetType: "map", items: [summary] }).success).toBe(true);
    expect(publicReviewCommentPageSchema.safeParse({ contractVersion: "1", targetType: "map", targetId: "map.test", items: [{ rating: 5, comment: "很好", author: null, createdAt: 1 }, { rating: 4, comment: "稳定", author: { displayName: "公开玩家" }, createdAt: 2 }], page: 1, pageSize: 20, total: 2, hasMore: false }).success).toBe(true);
    expect(publicReviewCommentPageSchema.safeParse({ contractVersion: "1", targetType: "map", targetId: "map.test", items: [{ rating: 5, comment: "很好", author: { displayName: "公开玩家", playerId: "1234" }, createdAt: 1 }], page: 1, pageSize: 20, total: 1, hasMore: false }).success).toBe(false);
  });

  it("accepts player OCR summaries without raw recognition output", () => {
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "ready_for_review", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "awaiting_player_confirmation", mapName: "成就挑战", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true, achievementTitles: ["守望先锋"] } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "resubmission_required", mapName: "测试地图", createdAt: 1, updatedAt: 2, manualReviewEligible: true }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "approved", mapName: "测试地图", createdAt: 1, updatedAt: 2, masteryOutcome: { status: "reused", awardedXp: 0, reason: "private" } }).success).toBe(false);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "approved", mapName: "测试地图", createdAt: 1, updatedAt: 2, masteryOutcome: { status: "created", awardedXp: 225 } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "ocr_review_required", mapName: "测试地图", createdAt: 1, updatedAt: 2, masteryOutcome: { status: "conflict", awardedXp: 0 } }).success).toBe(false);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "ready_for_review", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { responseJson: {} } }).success).toBe(false);
  });

  it("keeps legacy submission states visible in the admin contract", () => {
    expect(adminSubmissionSchema.safeParse({ submissionId: "00000000-0000-4000-8000-000000000003", status: "evidence_stored", challengeId: "map.test", challenge: null, mapName: "测试地图", difficulty: "困难", playerAccountId: "11111111-1111-4111-8111-111111111111", playerName: "Player", createdAt: 1, updatedAt: 2, ocrStatus: "not_started", ocrAttempt: null, ocrErrorCode: null, ocr: null, evidenceUrl: "https://api.example.com/evidence" }).success).toBe(true);
  });

  it("includes resolved challenge detail on admin player recent submissions", () => {
    const base = {
      submissionId: "00000000-0000-4000-8000-000000000003",
      status: "approved",
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
      titleGrants: [],
    }).success).toBe(true);
  });

  it("validates the single-image portal upload contract", () => {
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "image/png", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(true);
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "application/pdf", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(false);
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
    expect(agentSpatialConfigSchema.parse(spatialConfig).alternateStages).toEqual([]);
    expect(agentMapSchema.safeParse({ mapId: "map.samoa", mapName: "萨摩亚", gameVersion: "26.0810.1", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null, gameplayRevisions: [revision] }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, endPosition: [Number.POSITIVE_INFINITY, 0, 0] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, control: { centerPositions: [], jumpPositions: [[0, 0, 0]], respawnPositions: [[0, 0, 0], [1, 1, 1]], respawnAxis: "x", respawnAxisThreshold: 1 } }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, control: { centerPositions: [[0, 0, 0]], jumpPositions: [], respawnPositions: [], respawnAxis: "x", respawnAxisThreshold: 1 } }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, control: { centerPositions: [[0, 0, 0]], jumpPositions: [], respawnPositions: [[0, 0, 0]], respawnAxis: null, respawnAxisThreshold: 1 } }).success).toBe(false);
    const alternateStage = { stageId: "ruins", setupDetection: { position: [16, 17, 18], radius: 30 }, ...spatialConfig } as const;
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, alternateStages: [alternateStage] }).success).toBe(true);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, alternateStages: [{ ...alternateStage, setupDetection: { position: [16, 17, 18], radius: 0 } }] }).success).toBe(false);
    expect(agentSpatialConfigSchema.safeParse({ ...spatialConfig, alternateStages: [alternateStage, alternateStage] }).success).toBe(false);
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

    const update = { contractVersion: "1" as const, lifecycle: "preparing" as const, replacedDefaultLifecycle: null, gameVersion: "2099.01.01", mapVariant: null, spatialConfig: null, challengeAssignments: [] };
    expect(adminMapRevisionUpdateRequestSchema.safeParse(update).success).toBe(true);
    expect(adminMapRevisionUpdateRequestSchema.safeParse({ ...update, gameVersion: "  " }).success).toBe(false);
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

  it("validates an administrator challenge selection", () => {
    expect(adminSubmissionChallengeRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.paraiso.hell", mapId: "map.paraiso" }).success).toBe(true);
    expect(adminSubmissionChallengeRequestSchema.safeParse({ contractVersion: "1", challengeId: "" }).success).toBe(false);
  });

  it("accepts scheduled title challenges without a time window", () => {
    const input = { contractVersion: "1", family: "achievement", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", startsAt: 2_000, endsAt: 3_000 };
    expect(adminChallengeUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, endsAt: 1_000 }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, startsAt: undefined, endsAt: undefined }).success).toBe(true);
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

  it("keeps player OCR feedback to safe fields and a bounded presentation contract", () => {
    const feedback = { mode: "targeted", promptOrigin: "uncertainty", promptFieldKeys: ["difficulty"], fields: [{ key: "difficulty", value: "困难" }], ocrResultId: "00000000-0000-4000-8000-000000000004", submitted: false, available: true };
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "approved", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true }, feedback }).success).toBe(true);
    // Numeric confidence, thresholds, raw warnings and internal signals must not be part of the contract.
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "approved", mapName: "测试地图", createdAt: 1, updatedAt: 2, feedback: { ...feedback, fields: [{ key: "difficulty", value: "困难", confidence: 0.7 }] } }).success).toBe(false);
    // Only safe field keys may appear.
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "approved", mapName: "测试地图", createdAt: 1, updatedAt: 2, feedback: { ...feedback, promptFieldKeys: ["run_code"] } }).success).toBe(false);
  });

  it("validates player OCR feedback submissions", () => {
    expect(playerOcrFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "difficulty", action: "confirmed" }] }).success).toBe(true);
    expect(playerOcrFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }).success).toBe(true);
    // A correction without a proposed visible value is invalid.
    expect(playerOcrFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "difficulty", action: "corrected" }] }).success).toBe(false);
    // Unsafe fields are rejected at the contract boundary.
    expect(playerOcrFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [{ fieldKey: "run_code", action: "confirmed" }] }).success).toBe(false);
    expect(playerOcrFeedbackRequestSchema.safeParse({ contractVersion: "1", ocrResultId: "00000000-0000-4000-8000-000000000004", items: [] }).success).toBe(false);
    expect(playerOcrFeedbackResponseSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", recorded: [{ fieldKey: "difficulty", action: "confirmed", status: "submitted" }], alreadySubmitted: false }).success).toBe(true);
  });

  it("validates maintainer annotation decisions without requiring reasons", () => {
    const base = { contractVersion: "1" };
    expect(adminAnnotationDecisionRequestSchema.safeParse({ ...base, action: "accept" }).success).toBe(true);
    expect(adminAnnotationDecisionRequestSchema.safeParse({ ...base, action: "reject" }).success).toBe(true);
    expect(adminAnnotationDecisionRequestSchema.safeParse({ ...base, action: "edit_accept", reviewedValue: "普通" }).success).toBe(true);
    // edit_accept without a reviewed transcription is invalid.
    expect(adminAnnotationDecisionRequestSchema.safeParse({ ...base, action: "edit_accept" }).success).toBe(false);
    expect(adminAnnotationDecisionRequestSchema.safeParse({ ...base, action: "accept", normalizedValue: "一般" }).success).toBe(false);
    expect(adminAnnotationDecisionResponseSchema.safeParse({ contractVersion: "1", proposalId: "00000000-0000-4000-8000-000000000005", reviewState: "accepted", annotationId: "00000000-0000-4000-8000-000000000006" }).success).toBe(true);
  });

  it("validates direct reviewed annotation creation for eligible OCR fields", () => {
    expect(adminAnnotationDirectCreateRequestSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", ocrResultId: "00000000-0000-4000-8000-000000000004", fieldKey: "map_name", reviewedValue: "皇家赛道" }).success).toBe(true);
    expect(adminAnnotationDirectCreateRequestSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", ocrResultId: "00000000-0000-4000-8000-000000000004", fieldKey: "map_name", reviewedValue: "皇家赛道", normalizedValue: "map.royal", note: "人工核对" }).success).toBe(true);
    expect(adminAnnotationDirectCreateRequestSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", ocrResultId: "00000000-0000-4000-8000-000000000004", fieldKey: "run_code", reviewedValue: "1234" }).success).toBe(false);
    expect(adminAnnotationDirectCreateResponseSchema.safeParse({ contractVersion: "1", annotationId: "00000000-0000-4000-8000-000000000006", supersededAnnotationId: null }).success).toBe(true);
  });

  it("keeps the annotation proposal queue contract explainable and free of raw scoring internals", () => {
    const item = {
      proposalId: "00000000-0000-4000-8000-000000000005",
      submissionId: "00000000-0000-4000-8000-000000000003",
      submissionMapName: "测试地图",
      submissionCreatedAt: 1,
      ocrResultId: "00000000-0000-4000-8000-000000000004",
      fieldKey: "difficulty",
      originalValue: "困难",
      feedbackType: "corrected",
      promptOrigin: "uncertainty",
      proposedValue: "一般",
      modelVersion: "ocr-v1",
      layoutVersion: "layout-v2",
      playerSubmittedAt: 2,
      reviewState: "pending",
      priority: { score: 25, category: "correction", reasons: ["correction"] },
    };
    expect(adminAnnotationProposalSchema.safeParse(item).success).toBe(true);
    // The queue must not carry raw confidence or threshold internals.
    expect(adminAnnotationProposalSchema.safeParse({ ...item, priority: { score: 25, category: "correction", reasons: ["correction"], confidence: 0.7 } }).success).toBe(false);
    expect(adminAnnotationProposalListResponseSchema.safeParse({ contractVersion: "1", items: [item], page: 1, pageSize: 20, total: 1, hasMore: false }).success).toBe(true);
    expect(adminReviewedAnnotationSchema.safeParse({
      annotationId: "00000000-0000-4000-8000-000000000006",
      submissionId: "00000000-0000-4000-8000-000000000003",
      submissionMapName: "测试地图",
      ocrResultId: "00000000-0000-4000-8000-000000000004",
      proposalId: "00000000-0000-4000-8000-000000000005",
      fieldKey: "difficulty",
      originalOcrValue: "困难",
      modelVersion: "ocr-v1",
      layoutVersion: "layout-v2",
      reviewedValue: "一般",
      normalizedValue: "一般",
      playerAccountId: "player-1",
      playerProposedValue: "一般",
      promptOrigin: "uncertainty",
      reviewState: "accepted",
      reviewedBy: "maintainer-1",
      reviewedAt: 3,
      note: null,
      supersedesAnnotationId: null,
      createdAt: 3,
    }).success).toBe(true);
  });

  it("validates dataset draft creation and finalization contracts", () => {
    expect(adminDatasetCreateRequestSchema.safeParse({ contractVersion: "1", note: "v1 采样" }).success).toBe(true);
    expect(adminDatasetCreateRequestSchema.safeParse({ contractVersion: "1" }).success).toBe(true);
    const counts = { eligibleCount: 2, excludedCount: 1, submissionCount: 1, annotationCount: 2 };
    expect(adminDatasetCreateResponseSchema.safeParse({ contractVersion: "1", datasetId: "00000000-0000-4000-8000-000000000007", version: 1, status: "draft", counts }).success).toBe(true);
    expect(adminDatasetCreateResponseSchema.safeParse({ contractVersion: "1", datasetId: "00000000-0000-4000-8000-000000000007", version: 1, status: "finalized", counts }).success).toBe(false);
    expect(adminDatasetFinalizeRequestSchema.safeParse({ contractVersion: "1" }).success).toBe(true);
    expect(adminDatasetFinalizeResponseSchema.safeParse({ contractVersion: "1", datasetId: "00000000-0000-4000-8000-000000000007", version: 1, status: "finalized", finalizedAt: 2 }).success).toBe(true);
    expect(adminDatasetListResponseSchema.safeParse({ contractVersion: "1", items: [{ datasetId: "00000000-0000-4000-8000-000000000007", version: 1, status: "draft", createdBy: "admin", createdAt: 1, finalizedBy: null, finalizedAt: null, note: null, counts }], page: 1, pageSize: 20, total: 1, hasMore: false }).success).toBe(true);
    expect(adminDatasetDetailResponseSchema.safeParse({ contractVersion: "1", snapshot: { datasetId: "00000000-0000-4000-8000-000000000007", version: 1, status: "draft", createdBy: "admin", createdAt: 1, finalizedBy: null, finalizedAt: null, note: null, counts }, members: [{ annotationId: "00000000-0000-4000-8000-000000000006", fieldKey: "difficulty", reviewedValue: "一般", normalizedValue: "一般", originalOcrValue: "困难", modelVersion: "ocr-v1", layoutVersion: "layout-v2", evidence: { available: true, contentType: "image/png" } }], exclusions: [{ annotationId: "00000000-0000-4000-8000-000000000008", reason: "missing_model_version" }] }).success).toBe(true);
  });

  it("keeps the OCRKit consumption contract private, versioned, and free of identity and risk internals", () => {
    const response = {
      contractVersion: "1",
      snapshot: { id: "00000000-0000-4000-8000-000000000007", version: 1, finalizedAt: 2, note: null },
      members: [{ annotationId: "00000000-0000-4000-8000-000000000006", fieldKey: "difficulty", reviewedValue: "一般", normalizedValue: "一般", originalOcrValue: "困难", modelVersion: "ocr-v1", layoutVersion: "layout-v2", evidence: { id: "00000000-0000-4000-8000-000000000006", available: true, contentType: "image/png" } }],
    };
    expect(ocrkitDatasetResponseSchema.safeParse(response).success).toBe(true);
    // The contract rejects fields that would leak player identity or risk internals.
    expect(ocrkitDatasetResponseSchema.safeParse({ ...response, members: [{ ...response.members[0], playerAccountId: "player-1" }] }).success).toBe(false);
    expect(ocrkitDatasetResponseSchema.safeParse({ ...response, members: [{ ...response.members[0], evidence: { ...response.members[0].evidence, objectKey: "evidence/1.png" } }] }).success).toBe(false);
  });
});
