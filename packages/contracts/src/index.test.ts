import { describe, expect, it } from "vitest";
import { adminChallengeUpdateRequestSchema, adminSubmissionReviewRequestSchema, currentPlayerResponseSchema, playerUploadSessionRequestSchema, qqBindingRequestSchema, qqLoginVerifyRequestSchema, submissionRequestSchema } from "./index";

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

  it("validates the single-image portal upload contract", () => {
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "image/png", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(true);
    expect(playerUploadSessionRequestSchema.safeParse({ contractVersion: "1", challengeId: "map.samoa.hell", contentType: "application/pdf", byteSize: 1024, sha256: "a".repeat(64) }).success).toBe(false);
  });

  it("requires a reason for every review decision", () => {
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "approved", reason: "截图与 OCR 结果一致" }).success).toBe(true);
    expect(adminSubmissionReviewRequestSchema.safeParse({ contractVersion: "1", decision: "rejected", reason: "" }).success).toBe(false);
  });

  it("requires a Bastion version when retiring an achievement", () => {
    const input = { contractVersion: "1", family: "achievement", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "retired" };
    expect(adminChallengeUpdateRequestSchema.safeParse(input).success).toBe(false);
    expect(adminChallengeUpdateRequestSchema.safeParse({ ...input, retiredVersion: "2026.07.16" }).success).toBe(true);
    expect(adminChallengeUpdateRequestSchema.safeParse({ contractVersion: "1", family: "map", status: "retired", retiredVersion: "2026.07.16" }).success).toBe(true);
  });
});
