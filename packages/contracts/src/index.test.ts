import { describe, expect, it } from "vitest";
import { adminChallengeSchema, adminChallengeUpdateRequestSchema, adminSubmissionReviewRequestSchema, currentPlayerResponseSchema, playerSubmissionDetailSchema, playerUploadSessionRequestSchema, qqBindingRequestSchema, qqLoginVerifyRequestSchema, submissionRequestSchema } from "./index";

describe("v1 platform contracts", () => {
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
    expect(playerSubmissionDetailSchema.safeParse({ contractVersion: "1", submissionId: "00000000-0000-4000-8000-000000000003", status: "ready_for_review", mapName: "测试地图", createdAt: 1, updatedAt: 2, ocr: { responseJson: {} } }).success).toBe(false);
  });

  it("validates the single-image portal upload contract", () => {
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "image/png", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(true);
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "application/pdf", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(false);
  });

  it("requires a reason for every review decision", () => {
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", reason: "截图与 OCR 结果一致" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected", reason: "" }).success).toBe(false);
  });

  it("requires a current-format Bastion version only when sunsetting an achievement", () => {
    const input = { contractVersion: "1", family: "achievement", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "retired" };
    expect(adminChallengeUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, iconUrl: "https://cdn.example.com/icon.webp" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, iconUrl: "not-a-url" }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, retiredVersion: "26.0713.1" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, status: "sunsetting" }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, status: "sunsetting", retiredVersion: "26.0713.2" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, retiredVersion: "2026.07.16" }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ contractVersion: "1", family: "map", status: "retired" }).success).toBe(true);
  });

  it("requires a complete time window for scheduled title challenges", () => {
    const input = { contractVersion: "1", family: "achievement", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", startsAt: 2_000, endsAt: 3_000 };
    expect(adminChallengeUpdateRequestSchema.safeParse(input).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, endsAt: 1_000 }).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, endsAt: undefined }).success).toBe(false);
  });

  it("keeps historical retirement version records readable", () => {
    expect(adminChallengeSchema.safeParse({ challengeId: "map.test", family: "map", type: "map_completion", kind: "difficulty_completion", name: "测试挑战", mapId: "map.test", mapName: "测试地图", gameVersion: "2026.07.15", status: "retired", introducedVersion: "2026.07.15", retiredVersion: "2026.07.16" }).success).toBe(true);
  });
});
