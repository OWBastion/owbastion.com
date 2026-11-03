import { describe, expect, it } from "vitest";
import { isInheritedTitleGrant } from "./title-inheritance";

const grant = (titleKey: string, mapId: string | null = "map.1", gameplayRevisionId: string | null = "revision.1") => ({ titleKey, mapId, gameplayRevisionId });

describe("isInheritedTitleGrant", () => {
  it.each([
    ["DOMINATOR", "CONQUEROR"],
    ["PIONEER", "DOMINATOR"],
    ["PIONEER", "CONQUEROR"],
  ])("treats a %s grant as the source of an inherited %s", (source, historical) => {
    expect(isInheritedTitleGrant(grant(source), grant(historical))).toBe(true);
  });

  it.each([
    ["CONQUEROR", "DOMINATOR"],
    ["DOMINATOR", "PIONEER"],
    ["CONQUEROR", "CONQUEROR"],
    ["GLOBAL", "CONQUEROR"],
    ["PIONEER", "GLOBAL"],
  ])("does not treat a %s grant as the source of %s", (source, historical) => {
    expect(isInheritedTitleGrant(grant(source), grant(historical))).toBe(false);
  });

  it("stays within one map and gameplay revision and needs a source", () => {
    expect(isInheritedTitleGrant(grant("PIONEER"), grant("DOMINATOR", "map.2"))).toBe(false);
    expect(isInheritedTitleGrant(grant("PIONEER"), grant("DOMINATOR", "map.1", "revision.2"))).toBe(false);
    expect(isInheritedTitleGrant(null, grant("DOMINATOR"))).toBe(false);
  });
});
