import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { aggregateTitleStillMet } from "./aggregate-title";
import { gameplayRevisions, maps, playerEquippedTitles, playerTitleGrants, titleCatalog } from "./schema";

type Database = ReturnType<typeof drizzle>;

/** Grants the player may equip from the given ids; throws when any id is not an equipable global title. */
export const findEquipableGrants = async (db: Database, playerAccountId: string, grantIds: string[]) => {
  if (!grantIds.length) return [];
  const grants = await db.select({ id: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey }).from(playerTitleGrants)
    .innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key))
    .leftJoin(gameplayRevisions, eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id))
    .where(and(
      inArray(playerTitleGrants.id, grantIds),
      eq(playerTitleGrants.playerAccountId, playerAccountId),
      eq(playerTitleGrants.status, "active"),
      aggregateTitleStillMet(),
      isNotNull(titleCatalog.gameVersion),
      eq(titleCatalog.scope, "global"),
      or(
        and(isNull(playerTitleGrants.mapId), isNull(playerTitleGrants.gameplayRevisionId)),
        and(eq(playerTitleGrants.mapId, gameplayRevisions.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])),
      ),
    ));
  if (grants.length !== grantIds.length || new Set(grants.map((grant) => grant.titleKey)).size !== grants.length) throw new Error("EQUIPPED_TITLE_GRANT_INVALID");
  return grants;
};

/** Active grants the player currently owns and may see, newest first. */
export const listVisiblePlayerTitleRows = (db: Database, playerAccountId: string) => {
  return db.select({ grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, revisionMapId: gameplayRevisions.mapId, equipped: playerEquippedTitles.grantId }).from(playerTitleGrants)
    .innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key))
    .leftJoin(playerEquippedTitles, eq(playerEquippedTitles.grantId, playerTitleGrants.id))
    .leftJoin(maps, eq(playerTitleGrants.mapId, maps.id))
    .leftJoin(gameplayRevisions, eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id))
    .where(and(
      eq(playerTitleGrants.playerAccountId, playerAccountId),
      eq(playerTitleGrants.status, "active"),
      aggregateTitleStillMet(),
      or(
        and(
          eq(titleCatalog.scope, "global"),
          isNotNull(titleCatalog.gameVersion),
          or(
            and(isNull(playerTitleGrants.mapId), isNull(playerTitleGrants.gameplayRevisionId)),
            and(eq(playerTitleGrants.mapId, gameplayRevisions.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])),
          ),
        ),
        and(eq(titleCatalog.scope, "map"), isNotNull(titleCatalog.gameVersion), eq(playerTitleGrants.mapId, gameplayRevisions.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])),
      ),
    )).orderBy(desc(playerTitleGrants.grantedAt));
};
