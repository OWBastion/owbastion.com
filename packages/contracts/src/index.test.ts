import { describe, expect, it } from "vitest";
import { currentPlayerResponseSchema, qqBindingRequestSchema, qqLoginVerifyRequestSchema, submissionRequestSchema } from "./index";

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
    expect(currentPlayerResponseSchema.safeParse({ contractVersion: "1", player: { playerId: "1234", playerName: "Player", bindingStatus: "bound" }, recentSubmissions: [] }).success).toBe(true);
  });
});
