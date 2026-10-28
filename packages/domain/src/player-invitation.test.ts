import { describe, expect, it } from "vitest";
import { playerInvitationPeriodRange, validatePlayerInvitationCode } from "./player-invitation";

const at = (iso: string) => Date.parse(iso);

describe("player invitation code", () => {
  it("normalizes to upper case and accepts letters, digits, and inner hyphens", () => {
    expect(validatePlayerInvitationCode(" bun-123 ")).toEqual({ code: "BUN-123" });
  });

  it.each(["abc", "a".repeat(21), "-abcd", "abcd-", "ab cd", "中文码呀呀", "ab_cd"])("rejects %j", (value) => {
    expect(validatePlayerInvitationCode(value)).toEqual({ error: "PLAYER_INVITATION_CODE_INVALID" });
  });

  it("rejects reserved prefixes", () => {
    expect(validatePlayerInvitationCode("admin-fan")).toEqual({ error: "PLAYER_INVITATION_CODE_RESERVED" });
  });
});

describe("player invitation period", () => {
  it("starts a day at 00:00 UTC+8", () => {
    expect(playerInvitationPeriodRange("day", at("2026-10-28T15:59:59Z"))).toEqual({ start: at("2026-10-27T16:00:00Z"), end: at("2026-10-28T16:00:00Z") });
    expect(playerInvitationPeriodRange("day", at("2026-10-28T16:00:00Z"))).toEqual({ start: at("2026-10-28T16:00:00Z"), end: at("2026-10-29T16:00:00Z") });
  });

  it("starts a week on Monday 00:00 UTC+8", () => {
    // 2026-10-26 is a Monday. Sunday 23:59 UTC+8 still belongs to the earlier week.
    expect(playerInvitationPeriodRange("week", at("2026-10-28T02:00:00Z"))).toEqual({ start: at("2026-10-25T16:00:00Z"), end: at("2026-11-01T16:00:00Z") });
    expect(playerInvitationPeriodRange("week", at("2026-11-01T15:59:59Z")).start).toBe(at("2026-10-25T16:00:00Z"));
    expect(playerInvitationPeriodRange("week", at("2026-11-01T16:00:00Z")).start).toBe(at("2026-11-01T16:00:00Z"));
  });

  it("starts a month on the 1st at 00:00 UTC+8, including year rollover", () => {
    expect(playerInvitationPeriodRange("month", at("2026-12-31T16:00:00Z"))).toEqual({ start: at("2026-12-31T16:00:00Z"), end: at("2027-01-31T16:00:00Z") });
    expect(playerInvitationPeriodRange("month", at("2026-10-31T15:59:59Z")).start).toBe(at("2026-09-30T16:00:00Z"));
  });
});
