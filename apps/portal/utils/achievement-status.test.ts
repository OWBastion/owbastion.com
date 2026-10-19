import { describe, expect, it } from "vitest";
import type { OwnedTitle } from "~/types/title";
import { achievementState, findOwnedTitle } from "./achievement-status";

const title = (overrides: Record<string, unknown>) => ({ titleKey: "T", scope: "global", equipped: false, ...overrides }) as unknown as OwnedTitle;

describe("achievement ownership", () => {
  it("distinguishes unowned, owned and equipped", () => {
    expect(achievementState(undefined)).toBe("none");
    expect(achievementState(title({ equipped: false }))).toBe("obtained");
    expect(achievementState(title({ equipped: true }))).toBe("equipped");
  });

  it("matches a global achievement only against a global title", () => {
    const mapTitle = title({ scope: "map", mapId: "m1", gameplayRevisionId: "r1" });
    const globalTitle = title({ scope: "global" });
    expect(findOwnedTitle([mapTitle], { titleKey: "T" })).toBeUndefined();
    expect(findOwnedTitle([mapTitle, globalTitle], { titleKey: "T" })).toBe(globalTitle);
  });

  it("matches a map achievement only on the same map and gameplay revision", () => {
    const owned = title({ scope: "map", mapId: "m1", gameplayRevisionId: "r1" });
    expect(findOwnedTitle([owned], { titleKey: "T", mapId: "m1", gameplayRevisionId: "r1" })).toBe(owned);
    expect(findOwnedTitle([owned], { titleKey: "T", mapId: "m2", gameplayRevisionId: "r1" })).toBeUndefined();
    expect(findOwnedTitle([owned], { titleKey: "T", mapId: "m1", gameplayRevisionId: "r2" })).toBeUndefined();
    expect(findOwnedTitle([owned], { titleKey: "OTHER", mapId: "m1", gameplayRevisionId: "r1" })).toBeUndefined();
    expect(findOwnedTitle([title({ scope: "global" })], { titleKey: "T", mapId: "m1", gameplayRevisionId: "r1" })).toBeUndefined();
  });

  it("treats a player with no title list as owning nothing", () => {
    expect(findOwnedTitle(undefined, { titleKey: "T" })).toBeUndefined();
  });
});
