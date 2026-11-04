import { describe, expect, it } from "vitest";
import { adminMapTitleRuleCreateRequestSchema, adminSubmissionReviewPreviewRequestSchema, adminSubmissionReviewRequestSchema, currentPlayerMasteryResponseSchema, currentPlayerResponseSchema, mapChallengeSchema, playerReviewResponseSchema, playerReviewUpsertRequestSchema, playerReviewUpsertResponseSchema, playerReviewWithdrawRequestSchema, playerReviewWithdrawResponseSchema, playerProfileVisibilityRequestSchema, playerProfileVisibilityResponseSchema, leaderboardEntrySchema, playerSubmissionDetailSchema, playerUploadSessionRequestSchema, publicReviewCommentPageSchema, publicReviewSummaryResponseSchema, qqBindingClaimVerifyRequestSchema, playerHandleStateResponseSchema, publicPlayerProfileSchema } from "./index";

describe("v1 platform contracts", () => {

  it("keeps challenge qualification canonical and complete OCR field review explicit", () => {
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "achievement_titles", reviewedValue: "HERO、SECOND" }] }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "difficulty", reviewedValue: "一般" }] }).success).toBe(true);
    // The screenshot may legitimately show no achievements; no other field can be confirmed empty.
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "achievement_titles", reviewedValue: "" }] }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "difficulty", reviewedValue: "" }] }).success).toBe(false);
    const everyField = ["map_name", "difficulty", "viewer_player", "challenge_completed", "map_variant", "mode", "achievement_titles", "version", "run_code", "duration_seconds", "deaths", "skips"];
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: everyField.map((fieldKey) => ({ fieldKey, reviewedValue: "1" })) }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", fieldCorrections: [{ fieldKey: "difficulty", reviewedValue: "一般" }, { fieldKey: "difficulty", reviewedValue: "困难" }] }).success).toBe(false);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", confirmedChallengeIds: ["legacy:title_challenge:title.hero:::abc"] }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", confirmedChallengeIds: ["challenge.a", "challenge.a"] }).success).toBe(false);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected", confirmedChallengeIds: ["challenge.a"] }).success).toBe(false);
    expect(adminSubmissionReviewPreviewRequestSchema.safeParse({ contractVersion: "1", confirmedChallengeIds: ["challenge.a"], fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "国王大道" }] }).success).toBe(true);
    expect(adminSubmissionReviewPreviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved" }).success).toBe(false);
  });

  it("accepts QQ binding claim verification without treating QQ as Portal authentication", () => {
    expect(qqBindingClaimVerifyRequestSchema.safeParse({ contractVersion: "1", provider: "qq", code: "ABC234", groupOpenId: "group-1", memberOpenId: "user-1", messageId: "message-1" }).success).toBe(true);
  });


  it("accepts a player response without QQ identifiers", () => {
    expect(currentPlayerResponseSchema.safeParse({ contractVersion: "1", player: { playerId: "1234", playerName: "Player", isAdmin: false }, recentSubmissions: [] }).success).toBe(true);
  });

  it("keeps player handle projections free of private identity", () => {
    const state = { contractVersion: "1", handle: "tester", pending: { requestId: "00000000-0000-4000-8000-000000000001", handle: "newone", requestedAt: 1 }, rejected: null };
    expect(playerHandleStateResponseSchema.safeParse(state).success).toBe(true);
    expect(playerHandleStateResponseSchema.safeParse({ ...state, playerAccountId: "p1" }).success).toBe(false);
    const profile = { contractVersion: "1", publicProfile: true, handle: "tester", player: { displayName: "Tester", equippedTitle: null }, boards: { mastery: null, achievement: null }, perMapXp: [], mapCount: 0, titles: { map: [], general: [] }, activity: [{ date: "2026-10-07", runCount: 2 }] };
    expect(publicPlayerProfileSchema.safeParse(profile).success).toBe(true);
    expect(publicPlayerProfileSchema.safeParse({ ...profile, playerId: "1234" }).success).toBe(false);
    expect(publicPlayerProfileSchema.safeParse({ ...profile, player: { displayName: "Tester", equippedTitle: null, qqOpenId: "q" } }).success).toBe(false);
  });

  it("keeps profile visibility owner-shaped and leaderboard entries free of private fields", () => {
    expect(playerProfileVisibilityRequestSchema.safeParse({ contractVersion: "1", publicProfile: false, hideBattleTag: true }).success).toBe(true);
    expect(playerProfileVisibilityRequestSchema.safeParse({ contractVersion: "1", publicProfile: false }).success).toBe(false);
    expect(playerProfileVisibilityRequestSchema.safeParse({ contractVersion: "1", publicProfile: "no", hideBattleTag: false }).success).toBe(false);
    expect(playerProfileVisibilityResponseSchema.safeParse({ contractVersion: "1", publicProfile: true, hideBattleTag: false }).success).toBe(true);
    const entry = { rank: 1, score: 100, reachedAt: 1_000, player: { playerKey: "key-1", displayName: "Player", equippedTitle: { titleKey: "PIONEER", label: "开拓者", icon: "trophy", iconUrl: null } } };
    expect(leaderboardEntrySchema.safeParse(entry).success).toBe(true);
    expect(leaderboardEntrySchema.safeParse({ ...entry, player: null }).success).toBe(true);
    expect(leaderboardEntrySchema.safeParse({ ...entry, player: { ...entry.player!, qqOpenId: "qq-1" } }).success).toBe(false);
    expect(leaderboardEntrySchema.safeParse({ ...entry, player: { ...entry.player!, bindingId: "b-1" } }).success).toBe(false);
    expect(leaderboardEntrySchema.safeParse({ ...entry, submissionId: "s-1" }).success).toBe(false);
    expect(leaderboardEntrySchema.safeParse({ ...entry, reviewNote: "note" }).success).toBe(false);
    expect(leaderboardEntrySchema.safeParse({ ...entry, riskScore: 3 }).success).toBe(false);
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


  it("allows review decisions without requiring a reason", () => {
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", reason: "截图与 OCR 结果一致" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected", reason: "" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected" }).success).toBe(true);
  });




  it("keeps Pioneer rules limited to explicit map exceptions", () => {
    const rule = { contractVersion: "1", titleKey: "PIONEER", kind: "pioneer", condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual", displayKind: "map_pioneer", slot: "pioneer", status: "active", introducedVersion: "2026.07.15", retiredVersion: null } as const;
    expect(adminMapTitleRuleCreateRequestSchema.safeParse({ ...rule, defaultScope: "all_active" }).success).toBe(false);
    expect(adminMapTitleRuleCreateRequestSchema.safeParse({ ...rule, defaultScope: "explicit" }).success).toBe(true);
  });







});
