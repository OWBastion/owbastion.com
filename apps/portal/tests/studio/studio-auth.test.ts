import { describe, expect, it } from "vitest";
import {
  isStudioCapabilityPath,
  safeStudioRedirect,
  studioAccessForPlayer,
  studioRequestDecision,
  studioUserForAdmin,
} from "../../server/utils/studio-auth";

const anonymous = null;
const player = { player: { playerName: "Player", isAdmin: false } };
const admin = { player: { playerName: "Maintainer", isAdmin: true } };

describe("Studio platform authorization bridge", () => {
  it.each([
    ["anonymous", anonymous, "anonymous"],
    ["non-admin", player, "non-admin"],
    ["admin", admin, "admin"],
  ])("classifies %s platform access", (_label, currentPlayer, expected) => {
    expect(studioAccessForPlayer(currentPlayer)).toBe(expected);
  });

  it("allows an admin across the editor and server write paths", () => {
    expect(studioRequestDecision("/_studio", admin)).toBe("allow");
    expect(studioRequestDecision("/__nuxt_studio/auth/session", admin)).toBe("allow");
    expect(studioRequestDecision("/__nuxt_studio/meta", admin)).toBe("allow");
    expect(studioRequestDecision("/__nuxt_studio/medias/blog/cover.png", admin)).toBe("allow");
  });

  it("denies editor and write access to anonymous and non-admin sessions", () => {
    for (const currentPlayer of [anonymous, player]) {
      expect(studioRequestDecision("/_studio", currentPlayer)).toBe("deny");
      expect(studioRequestDecision("/__nuxt_studio/meta", currentPlayer)).toBe("deny");
      expect(studioRequestDecision("/__nuxt_studio/medias/blog/cover.png", currentPlayer)).toBe("deny");
    }
  });

  it("clears the Studio session when the platform session is missing or no longer admin", () => {
    expect(studioRequestDecision("/__nuxt_studio/auth/session", anonymous)).toBe("clear-session");
    expect(studioRequestDecision("/__nuxt_studio/auth/session", player)).toBe("clear-session");
  });

  it("does not turn unrelated Portal requests into Studio requests", () => {
    expect(isStudioCapabilityPath("/admin/content")).toBe(false);
    expect(studioRequestDecision("/admin/content", admin)).toBe("ignore");
  });

  it("keeps the bridge identity free of platform-private identifiers", () => {
    expect(studioUserForAdmin(admin)).toEqual({ name: "Maintainer", email: "content-editor@owbastion.local", providerId: "platform-admin" });
    expect(studioUserForAdmin(admin)).not.toHaveProperty("playerId");
  });

  it("accepts only same-origin relative redirects", () => {
    expect(safeStudioRedirect("/admin/content?from=nav")).toBe("/admin/content?from=nav");
    expect(safeStudioRedirect("https://example.com/steal")).toBe("/admin/content");
    expect(safeStudioRedirect("//example.com/steal")).toBe("/admin/content");
    expect(safeStudioRedirect(undefined)).toBe("/admin/content");
  });
});
