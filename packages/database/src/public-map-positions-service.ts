import { and, eq, isNull } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import type { PublicMapPositions } from "@owbastion/contracts";
import { mapPositionStages, type PlatformServices } from "@owbastion/domain";
import type { PlatformCache } from "./platform-cache";
import { gameplayRevisions, maps } from "./schema";
import { parseAgentSpatialConfig } from "./spatial-config";

export const createPublicMapPositionServices = (db: ReturnType<typeof drizzle>, platformCache: PlatformCache): Pick<PlatformServices, "getPublicMapPositions"> => ({
  // Only an active map's current default revision is public; drafts and other revisions never are.
  getPublicMapPositions: (input) => platformCache.cached("catalog", `public-map-positions:${input.mapId}`, async (): Promise<PublicMapPositions | null> => {
    const row = await db.select({ mapId: maps.id, revisionId: gameplayRevisions.id, spatialConfigJson: gameplayRevisions.spatialConfigJson }).from(maps)
      .leftJoin(gameplayRevisions, and(eq(gameplayRevisions.mapId, maps.id), eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant)))
      .where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get();
    if (!row) return null;
    const config = parseAgentSpatialConfig(row.spatialConfigJson);
    return { mapId: row.mapId, gameplayRevisionId: config ? row.revisionId : null, stages: config ? mapPositionStages(config) : [] };
  }),
});
