import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Map } from "@owbastion/contracts";
import type { AuthContext, ChallengeProgressRule, PlatformServices } from "@owbastion/domain";
import { gameplayRevisions, mapTitleRules, maps, titleChallenges } from "./schema";

type Dependencies = {
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
  insertDefaultMapTitleRuleAssignment: (revisionId: string, mapId: string, ruleId: string, timestamp: number) => D1PreparedStatement;
  latestBuildVersion: () => Promise<string>;
  loadProgressChallenges: () => Promise<Array<{ challenge: typeof titleChallenges.$inferSelect; rule: ChallengeProgressRule }>>;
};

export const createAdminMapServices = (
  database: D1Database,
  db: ReturnType<typeof drizzle>,
  dependencies: Dependencies,
): Pick<PlatformServices, "createAdminMap"> => {
  const { now, replayOrConflict, recordIdempotency, recordAudit, insertDefaultMapTitleRuleAssignment, latestBuildVersion, loadProgressChallenges } = dependencies;

  // The active maps a regular-mode Run can be recorded on.
  const regularMapPool = async () => (await db.selectDistinct({ mapId: gameplayRevisions.mapId }).from(gameplayRevisions)
    .innerJoin(maps, eq(gameplayRevisions.mapId, maps.id))
    .where(and(eq(maps.status, "active"), isNull(gameplayRevisions.mode), inArray(gameplayRevisions.lifecycle, ["default", "selectable"]))))
    .map((row) => row.mapId).sort();

  // A regular-mode progress rule that lists exactly the current map pool means
  // "every map", so a newly added map joins it. Holders are not revoked here;
  // the rule is re-evaluated against a player's next Verified Run.
  const extendRegularPoolProgressRules = async (poolBefore: string[], newMapId: string, timestamp: number) => {
    const statements: D1PreparedStatement[] = [];
    for (const { challenge, rule } of await loadProgressChallenges()) {
      if (rule.mode || !rule.mapIds || JSON.stringify([...rule.mapIds].sort()) !== JSON.stringify(poolBefore)) continue;
      statements.push(database.prepare("UPDATE title_challenges SET progress_rule = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify({ ...rule, mapIds: [...rule.mapIds, newMapId].sort() }), timestamp, challenge.id));
    }
    if (statements.length) await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };

  return {
    async createAdminMap(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Map>(auth.subject, "admin.map.create", idempotencyKey, input);
      if (replay) return replay;
      const mapName = input.mapName.trim();
      if (await db.select({ id: maps.id }).from(maps).where(eq(maps.name, mapName)).get()) throw new Error("MAP_NAME_CONFLICT");
      const mapId = input.mapId ?? `map.new_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
      if (await db.select({ id: maps.id }).from(maps).where(eq(maps.id, mapId)).get()) throw new Error("MAP_ID_CONFLICT");
      const gameVersion = input.gameVersion ?? await latestBuildVersion();
      const timestamp = now();
      const revisionId = `revision:${mapId}:initial`;
      // The default revision starts without spatial configuration and with every active all-map title rule, as the original maps did.
      const rules = await db.select().from(mapTitleRules).where(and(eq(mapTitleRules.defaultScope, "all_active"), eq(mapTitleRules.status, "active"), isNull(mapTitleRules.mapVariant)));
      const poolBefore = await regularMapPool();
      await database.batch([
        database.prepare("INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)").bind(mapId, mapName, gameVersion, gameVersion, timestamp, timestamp),
        database.prepare("INSERT INTO map_metadata (map_id, difficulty_rating, mechanics_json, cover_url, background_url, updated_at, updated_by) VALUES (?, NULL, '[]', NULL, NULL, ?, ?)").bind(mapId, timestamp, auth.subject),
        database.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES (?, ?, 'default', NULL, NULL, NULL, NULL, ?, NULL, ?, ?)").bind(revisionId, mapId, gameVersion, timestamp, timestamp),
        ...rules.filter((rule) => rule.kind.trim().toLocaleLowerCase() !== "pioneer").map((rule) => insertDefaultMapTitleRuleAssignment(revisionId, mapId, rule.id, timestamp)),
      ]);
      await extendRegularPoolProgressRules(poolBefore, mapId, timestamp);
      const response: Map = { mapId, mapName, gameVersion, difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null };
      await recordIdempotency(auth.subject, "admin.map.create", idempotencyKey, input, response);
      await recordAudit(auth, "admin.map.create", "map", mapId, { mapName, gameVersion });
      return response;
    },
  };
};
