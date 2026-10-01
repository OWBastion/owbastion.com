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
  it("gives the invitation code separately from the bind page link", () => {
    const text = bindingInviteCopyText("ABCDEFGHIJKL", "https://owbastion.com");
    expect(text).toContain("https://owbastion.com/bind\n");
    expect(text).toContain("邀请码：ABCDEFGHIJKL");
    expect(text).not.toContain("?code=");
    expect(text).toContain("QQ 群完成验证");
    expect(text).toContain("添加 Passkey");
    expect(text).not.toContain("注册链接");
    expect(text).not.toContain("playerName");
    expect(text).not.toContain("playerId");
  });
});
