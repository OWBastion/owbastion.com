import { describe, expect, it } from "vitest";
import { bindingInviteBatchLimit, bindingInviteCopyText, parseBattleTag, parseBattleTagBatch, qqVerificationCommand } from "./binding-invite";

describe("BattleTag helpers", () => {
  it("parses the same complete BattleTag format used by batch invitations", () => {
    expect(parseBattleTag(" Player#1234 ")).toEqual({ playerName: "Player", playerId: "1234" });
    expect(parseBattleTag("Player")).toBeNull();
  });

  it("keeps the QQ mention out of copied verification commands", () => {
    expect(qqVerificationCommand("ABC234")).toBe("/验证 ABC234");
  });

  it("parses batch lines, dedupes case-insensitively, and flags invalid and duplicate lines", () => {
    const batch = parseBattleTagBatch("Player#1234\nplayer#1234\nbad-line\n\nOther#99");
    expect(batch.players).toEqual([{ playerName: "Player", playerId: "1234" }, { playerName: "Other", playerId: "99" }]);
    expect(batch.errors).toEqual(["第 2 行重复", "第 3 行格式无效"]);
  });

  it("rejects batches over the invitation limit", () => {
    const batch = parseBattleTagBatch(Array.from({ length: bindingInviteBatchLimit + 1 }, (_, index) => `Player${index}#1234`).join("\n"));
    expect(batch.players).toHaveLength(bindingInviteBatchLimit + 1);
    expect(batch.errors).toEqual([`一次最多生成 ${bindingInviteBatchLimit} 个邀请码`]);
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
