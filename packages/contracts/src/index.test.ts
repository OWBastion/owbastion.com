import { describe, expect, it } from "vitest";
import { adminAchievementCreateRequestSchema, adminCatalogTitleUpdateRequestSchema, adminChallengeSchema, adminChallengeUpdateRequestSchema, adminManualTitleGrantRequestSchema, adminRandomEventUpdateRequestSchema, adminSubmissionReviewRequestSchema, adminSubmissionSchema, currentPlayerResponseSchema, playerSubmissionDetailSchema, playerUploadSessionRequestSchema, qqBindingRequestSchema, qqLoginVerifyRequestSchema, randomEventSchema, submissionRequestSchema } from "./index";

describe("v1 platform contracts", () => {
  it("validates global and scoped achievement creation", () => {
    const base = { contractVersion: "1" as const, titleKey: "CLASSIC_RACETRACK", titleName: "经典赛道", icon: "trophy", category: "经典版系列", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual" as const, status: "active" as const, gameVersion: "26.0728.1", scope: "map" as const };
    expect(adminAchievementCreateRequestSchema.safeParse({ ...base, mapIds: ["map.route66"] }).success).toBe(true);
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

  it("rejects a submission without evidence metadata", () => {
    expect(submissionRequestSchema.safeParse({ contractVersion: "1", actor: { provider: "qq", groupOpenId: "group-1", memberOpenId: "user-1" }, challenge: { type: "map_completion", mapName: "Test Map" }, source: { provider: "qq", conversationId: "group-1", messageId: "message-1" }, attachments: [] }).success).toBe(false);
  });

  it("rejects an unversioned contract", () => {
    expect(qqBindingRequestSchema.safeParse({ contractVersion: "2", provider: "qq", groupOpenId: "group-1", memberOpenId: "user-1", playerName: "Player", playerId: "1234" }).success).toBe(false);
  });

  it("accepts the QQ login verification contract", () => {
    expect(qqLoginVerifyRequestSchema.safeParse({ contractVersion: "1", provider: "qq", code: "ABC234", groupOpenId: "group-1", memberOpenId: "user-1", messageId: "message-1" }).success).toBe(true);
  });

  it("accepts a player response without QQ identifiers", () => {
    expect(currentPlayerResponseSchema.safeParse({ contractVersion: "1", player: { playerId: "1234", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] }).success).toBe(true);
  });

  it("accepts player OCR summaries without raw recognition output", () => {
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "ready_for_review", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "awaiting_player_confirmation", mapName: "成就挑战", createdAt: 1, updatedAt: 2, ocr: { mapName: "测试地图", difficulty: "困难", playerName: "Player", challengeCompleted: true, achievementTitles: ["守望先锋"] } }).success).toBe(true);
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "ready_for_review", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { responseJson: {} } }).success).toBe(false);
  });

  it("keeps legacy submission states visible in the admin contract", () => {
    expect(adminSubmissionSchema.safeParse({ submissionId: "00000000-0000-4000-8000-000000000003", status: "evidence_stored", challengeId: "map.test", challenge: null, mapName: "测试地图", difficulty: "困难", playerName: "Player", createdAt: 1, updatedAt: 2, ocrStatus: "not_started", ocrAttempt: null, ocrErrorCode: null, ocr: null, evidenceUrl: "https://api.example.com/evidence" }).success).toBe(true);
  });

  it("validates the single-image portal upload contract", () => {
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "image/png", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(true);
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "application/pdf", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(false);
  });

  it("allows review decisions without requiring a reason", () => {
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", reason: "截图与 OCR 结果一致" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected", reason: "" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected" }).success).toBe(true);
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
  });

  it("validates complete catalog-title challenge edits", () => {
    const input = { contractVersion: "1", status: "scheduled", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, startsAt: 2_000, endsAt: 3_000 };
    expect(adminCatalogTitleUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminCatalogTitleUpdateRequestSchema.safeParse({ ...input, endsAt: 1_000 }).success).toBe(false);
    expect(adminCatalogTitleUpdateRequestSchema.safeParse({ contractVersion: "1", status: "active", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, startsAt: 2_000, endsAt: 3_000 }).success).toBe(false);
  });

  it("keeps historical retirement version records readable", () => {
    expect(adminChallengeSchema.safeParse({ challengeId: "map.test", family: "map", type: "map_completion", kind: "difficulty_completion", name: "测试挑战", mapId: "map.test", mapName: "测试地图", gameVersion: "2026.07.15", status: "retired", introducedVersion: "2026.07.15", retiredVersion: "2026.07.16" }).success).toBe(true);
    expect(adminChallengeSchema.safeParse({ challengeId: "title.CLASSIC", family: "map", type: "map_completion", kind: "map_title_achievement", titleKey: "CLASSIC", name: "老兵", mapId: "map.circuit_royal", mapName: "皇家赛道", gameVersion: "2026.07.29", status: "active", introducedVersion: "2026.07.29", retiredVersion: null }).success).toBe(true);
  });
});
