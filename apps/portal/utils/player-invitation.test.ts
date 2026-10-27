import { describe, expect, it } from "vitest";
import { playerInvitationBlockedMessage, playerInvitationShareUrl } from "./player-invitation";

const eligibility = (mode: "any" | "all") => ({ eligible: false, mode, accountAgeDays: 3, minAccountAgeDays: 7, approvedSubmissions: 0, minApprovedSubmissions: 2 });

describe("playerInvitationBlockedMessage", () => {
  it("names every configured requirement and its relation", () => {
    expect(playerInvitationBlockedMessage({ createBlockedReason: "ineligible", eligibility: eligibility("all") })).toBe("需帐号注册满 7 天（现 3 天）且通过 2 次提交（现 0 次）。");
    expect(playerInvitationBlockedMessage({ createBlockedReason: "ineligible", eligibility: eligibility("any") })).toContain("或");
  });

  it("skips unchecked requirements and returns nothing when creation is allowed", () => {
    const only = { ...eligibility("any"), minAccountAgeDays: 0 };
    expect(playerInvitationBlockedMessage({ createBlockedReason: "ineligible", eligibility: only })).toBe("需通过 2 次提交（现 0 次）。");
    expect(playerInvitationBlockedMessage({ createBlockedReason: null, eligibility: null })).toBeUndefined();
  });
});

describe("playerInvitationShareUrl", () => {
  it("links to the bind page with the code", () => {
    expect(playerInvitationShareUrl("https://owbastion.com", "AB-12")).toBe("https://owbastion.com/bind?player-code=AB-12");
  });
});
