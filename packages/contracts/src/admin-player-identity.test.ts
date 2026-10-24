import { describe, expect, it } from "vitest";
import { adminPlayerIdentityRequestSchema } from "./index";

describe("admin player BattleTag contract", () => {
  it("requires a full BattleTag", () => {
    expect(adminPlayerIdentityRequestSchema.safeParse({ contractVersion: "1", playerName: "新名称", playerId: "2222" }).success).toBe(true);
    expect(adminPlayerIdentityRequestSchema.safeParse({ contractVersion: "1", playerName: "   ", playerId: "2222" }).success).toBe(false);
    expect(adminPlayerIdentityRequestSchema.safeParse({ contractVersion: "1", playerName: "新名称" }).success).toBe(false);
  });
});
