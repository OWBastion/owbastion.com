import { describe, expect, it } from "vitest";
import type { OwnedTitle } from "~/types/title";
import { buildMapProgressRows } from "./map-progress";

const map = { mapId: "map.a", mapName: "A", defaultGameplayRevisionId: "rev.1" };
const owned = (titleKey: string, gameplayRevisionId = "rev.1"): OwnedTitle => ({
  grantId: `grant.${titleKey}`, titleKey, label: titleKey, icon: "award", category: "c", condition: "", scope: "map", mapId: "map.a", gameplayRevisionId, grantedAt: 1, equipped: false,
}) as OwnedTitle;

describe("buildMapProgressRows", () => {
  it("keeps an earned map title whose challenge left the open catalog", () => {
    const [row] = buildMapProgressRows({
      maps: [map],
      challenges: [{ challengeId: "c.dom", mapId: "map.a", gameplayRevisionId: "rev.1", titleKey: "DOMINATOR", name: "D", status: "active" }],
      titles: [owned("DOMINATOR"), owned("PIONEER")],
    });
    expect(row!.challenges.map((challenge) => challenge.titleKey)).toEqual(["DOMINATOR", "PIONEER"]);
    expect(row!.earnedChallenges).toHaveLength(2);
  });

  it("ignores a closed title earned on another revision", () => {
    const [row] = buildMapProgressRows({ maps: [map], challenges: [], titles: [owned("PIONEER", "rev.0")] });
    expect(row!.challenges).toEqual([]);
  });
});
