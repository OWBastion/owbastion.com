import { describe, expect, it } from "vitest";
import { leaderboardPlayerKey, projectLeaderboardEntry, rankLeaderboardRows } from "./leaderboard";

const base = {
  rank: 3,
  score: 480,
  reachedAt: 1_700_000_000,
  identity: {
    playerKey: "key-1",
    displayName: "Player",
    equippedTitle: { titleKey: "PIONEER", label: "开拓者", icon: "trophy", iconUrl: null },
  },
  boards: {
    mastery: { rank: 3, score: 480 },
    achievement: null,
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

  it("keeps rank and score while withholding the identity block and inlining board standings for a non-public Player", () => {
    expect(projectLeaderboardEntry({ ...base, publicProfile: false })).toEqual({
      rank: 3,
      score: 480,
      reachedAt: 1_700_000_000,
      player: null,
      boards: base.boards,
    });
  });
});

describe("rankLeaderboardRows", () => {
  it("orders by score desc, earlier reached time, then account id for a deterministic board", () => {
    const rows = rankLeaderboardRows([
      { playerAccountId: "b", score: 100, reachedAt: 20 },
      { playerAccountId: "a", score: 100, reachedAt: 20 },
      { playerAccountId: "c", score: 200, reachedAt: 30 },
      { playerAccountId: "d", score: 100, reachedAt: 10 },
    ]);
    expect(rows.map((row) => [row.playerAccountId, row.rank])).toEqual([
      ["c", 1],
      ["d", 2],
      ["a", 3],
      ["b", 4],
    ]);
  });
});

describe("leaderboardPlayerKey", () => {
  it("derives a stable opaque key per account", async () => {
    const key = await leaderboardPlayerKey("account-1");
    expect(key).toMatch(/^[0-9a-f]{24}$/);
    expect(await leaderboardPlayerKey("account-1")).toBe(key);
    expect(await leaderboardPlayerKey("account-2")).not.toBe(key);
  });
});
