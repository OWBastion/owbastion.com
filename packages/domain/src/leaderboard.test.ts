import { describe, expect, it } from "vitest";
import { projectLeaderboardEntry } from "./leaderboard";

const base = {
  rank: 3,
  score: 480,
  reachedAt: 1_700_000_000,
  identity: {
    playerKey: "key-1",
    displayName: "Player",
    equippedTitle: { titleKey: "PIONEER", label: "开拓者", icon: "trophy", iconUrl: null },
  },
};

describe("public leaderboard entry projection", () => {
  it("keeps identity, rank, and score for a public Player", () => {
    expect(projectLeaderboardEntry({ ...base, publicProfile: true })).toEqual({
      rank: 3,
      score: 480,
      reachedAt: 1_700_000_000,
      player: base.identity,
    });
  });

  it("keeps rank and score while withholding the whole identity block for a non-public Player", () => {
    expect(projectLeaderboardEntry({ ...base, publicProfile: false })).toEqual({
      rank: 3,
      score: 480,
      reachedAt: 1_700_000_000,
      player: null,
    });
  });
});
