import type { LeaderboardBoardStanding, LeaderboardEntry, LeaderboardEntryPlayer } from "@owbastion/contracts";

export type LeaderboardEntrySource = {
  rank: number;
  score: number;
  reachedAt: number;
  publicProfile: boolean;
  identity: LeaderboardEntryPlayer;
  boards: { mastery: LeaderboardBoardStanding | null; achievement: LeaderboardBoardStanding | null };
};

// leaderboard.v1 ranking: score descending, then the earlier reached time
// ranks higher, then the Player Account id ascending so the order stays fully
// deterministic even when every visible field ties.
export const leaderboardRuleVersion = "leaderboard.v1";

export const rankLeaderboardRows = <Row extends { playerAccountId: string; score: number; reachedAt: number }>(
  rows: readonly Row[],
): Array<Row & { rank: number }> =>
  [...rows]
    .sort((a, b) => b.score - a.score || a.reachedAt - b.reachedAt || a.playerAccountId.localeCompare(b.playerAccountId))
    .map((row, index) => ({ ...row, rank: index + 1 }));

// The opaque public key carried by leaderboard entries. It resolves the
// public summary without exposing the BattleTag id pair or the internal
// account id; each Player Account stores a copy (player_accounts.leaderboard_key)
// written at creation so public lookups resolve by index. Rows predating the
// column are backfilled from this same function on first lookup.
export const leaderboardPlayerKey = async (playerAccountId: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`leaderboard:${playerAccountId}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
};

// A non-public Player keeps rank and score on public leaderboard projections;
// the whole display-identity block (name, avatar initial, equipped Title, and
// per-player detail) is withheld as one unit.
export const projectLeaderboardEntry = (source: LeaderboardEntrySource): LeaderboardEntry => ({
  rank: source.rank,
  score: source.score,
  reachedAt: source.reachedAt,
  player: source.publicProfile ? source.identity : null,
  ...(source.publicProfile ? {} : { boards: source.boards }),
});
