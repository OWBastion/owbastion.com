import { describe, expect, it } from "vitest";
import { bindingInviteCopyText, parseBattleTag, qqVerificationCommand } from "./binding-invite";

describe("BattleTag helpers", () => {
  it("parses the same complete BattleTag format used by batch invitations", () => {
    expect(parseBattleTag(" Player#1234 ")).toEqual({ playerName: "Player", playerId: "1234" });
    expect(parseBattleTag("Player")).toBeNull();
  });

  it("keeps the QQ mention out of copied verification commands", () => {
    expect(qqVerificationCommand("ABC234")).toBe("/验证 ABC234");
  });
});

describe("binding invitation links", () => {
  it("puts the one-time invitation code in the administrator link", () => {
    const text = bindingInviteCopyText("ABCDEFGHIJKL", "https://owbastion.com");
    expect(text).toContain("https://owbastion.com/bind?code=ABCDEFGHIJKL");
    expect(text).not.toContain("playerName");
    expect(text).not.toContain("playerId");
  });
});
