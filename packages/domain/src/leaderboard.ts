import type { LeaderboardEntry, LeaderboardEntryPlayer } from "@owbastion/contracts";

export type LeaderboardEntrySource = {
  rank: number;
  score: number;
  reachedAt: number;
  publicProfile: boolean;
  identity: LeaderboardEntryPlayer;
};

// A non-public Player keeps rank and score on public leaderboard projections;
// the whole display-identity block (name, avatar initial, equipped Title, and
// per-player detail) is withheld as one unit.
export const projectLeaderboardEntry = (source: LeaderboardEntrySource): LeaderboardEntry => ({
  rank: source.rank,
  score: source.score,
  reachedAt: source.reachedAt,
  player: source.publicProfile ? source.identity : null,
});
