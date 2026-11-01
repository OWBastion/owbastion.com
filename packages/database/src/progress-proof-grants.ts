import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { progressProofTitleKeys, type ChallengeProgressRule } from "@owbastion/domain";
import { gameplayRevisions, playerTitleGrants } from "./schema";

// Active map-scoped Grants that prove a clear without a Verified Run.
export const loadProofGrantMaps = async (
  db: ReturnType<typeof drizzle>,
  input: { playerAccountIds: string[]; rule: ChallengeProgressRule; requiredMapIds: string[]; startsAt: number | null; endsAt: number | null },
  chunked: <T>(items: T[]) => T[][],
) => {
  const titleKeys = progressProofTitleKeys(input.rule.difficultyAtLeast);
  if (!titleKeys.length || !input.requiredMapIds.length) return [];
  const conditions = [
    eq(playerTitleGrants.status, "active"),
    inArray(playerTitleGrants.titleKey, titleKeys),
    inArray(playerTitleGrants.mapId, input.requiredMapIds),
    input.rule.mode ? eq(gameplayRevisions.mode, input.rule.mode) : isNull(gameplayRevisions.mode),
    input.startsAt !== null ? gte(playerTitleGrants.grantedAt, input.startsAt) : undefined,
    input.endsAt !== null ? lt(playerTitleGrants.grantedAt, input.endsAt) : undefined,
  ];
  const select = (playerAccountIds: string[]) => db.selectDistinct({ playerAccountId: playerTitleGrants.playerAccountId, mapId: sql<string>`${playerTitleGrants.mapId}` })
    .from(playerTitleGrants)
    .leftJoin(gameplayRevisions, eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id))
    .where(and(...conditions, inArray(playerTitleGrants.playerAccountId, playerAccountIds)));
  return (await Promise.all(chunked(input.playerAccountIds).map(select))).flat();
};
