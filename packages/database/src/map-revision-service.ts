import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { agentProjectedSpatialConfigSchema, agentSpatialConfigSchema } from "@owbastion/contracts";
import type {
  AdminMapEditorChallengeOption,
  AdminMapEditorResponse,
  AdminMapMetadataUpdateRequest,
  AdminMapRevision,
  AdminMapRevisionChallengeAssignment,
  AdminMapRevisionUpdateRequest,
  AgentSpatialConfig,
  Map,
} from "@owbastion/contracts";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import {
  achievementChallengeMaps,
  achievementChallenges,
  auditEvents,
  gameplayRevisionChallengeAssignments,
  gameplayRevisions,
  mapMetadata,
  mapTitleRuleExceptions,
  mapTitleRules,
  maps,
  titleCatalog,
  titleChallenges,
} from "./schema";

type AdminMapRevisionServices = Pick<PlatformServices,
  | "listMaps"
  | "updateAdminMapMetadata"
  | "getAdminMapEditor"
  | "createAdminMapRevision"
  | "updateAdminMapRevision"
  | "promoteAdminMapRevision"
>;

type Dependencies = {
  now: () => number;
  hashRequest: (value: unknown) => Promise<string>;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
  insertDefaultMapTitleRuleAssignment: (revisionId: string, mapId: string, ruleId: string, timestamp: number) => D1PreparedStatement;
};

export const pioneerExceptionHasValidWindow = (startsAt: number | null, endsAt: number | null) => startsAt !== null && endsAt !== null && endsAt > startsAt;

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const normalizeSpatialConfig = <T extends AgentSpatialConfig>(config: T): T => "stages" in config
  ? { ...config, stages: [...config.stages].sort((left, right) => compareText(left.stageId, right.stageId)) } as T
  : { ...config, alternateStages: [...config.alternateStages].sort((left, right) => compareText(left.stageId, right.stageId)) } as T;
const parseSpatialConfig = (value: unknown): AgentSpatialConfig => {
  const parsed = agentSpatialConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_SPATIAL_CONFIG");
  return normalizeSpatialConfig(parsed.data);
};
export const parseAgentSpatialConfig = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed = agentProjectedSpatialConfigSchema.safeParse(JSON.parse(value));
    return parsed.success ? normalizeSpatialConfig(parsed.data) : null;
  } catch {
    return null;
  }
};

export const createMapRevisionServices = (
  database: D1Database,
  db: ReturnType<typeof drizzle>,
  dependencies: Dependencies,
): AdminMapRevisionServices => {
  const {
    now,
    hashRequest,
    replayOrConflict,
    recordIdempotency,
    recordAudit,
    insertDefaultMapTitleRuleAssignment,
  } = dependencies;
  const formatCurrentGameVersion = (timestamp = now()) => new Date(timestamp).toISOString().slice(0, 10).replaceAll("-", ".");
  const reconcileEquippedTitlesForHistoricalRevision = (revisionId: string) => [
    database.prepare(`
      WITH replacements AS MATERIALIZED (
        SELECT equipped.grant_id AS old_grant_id, (
          SELECT replacement.id
          FROM player_title_grants AS old_grant
          JOIN player_title_grants AS replacement
            ON replacement.player_account_id = old_grant.player_account_id
           AND replacement.title_key = old_grant.title_key
          JOIN title_catalog AS title ON title.key = replacement.title_key
          LEFT JOIN gameplay_revisions AS replacement_revision ON replacement_revision.id = replacement.gameplay_revision_id
          WHERE old_grant.id = equipped.grant_id
            AND replacement.status = 'active'
            AND title.scope = 'global'
            AND title.game_version IS NOT NULL
            AND (
              (replacement.map_id IS NULL AND replacement.gameplay_revision_id IS NULL)
              OR (replacement.map_id = replacement_revision.map_id AND replacement_revision.lifecycle IN ('default', 'selectable'))
            )
            AND NOT EXISTS (
              SELECT 1 FROM player_equipped_titles AS existing
              WHERE existing.player_account_id = equipped.player_account_id
                AND existing.grant_id = replacement.id
            )
          ORDER BY replacement.granted_at DESC, replacement.id
          LIMIT 1
        ) AS replacement_grant_id
        FROM player_equipped_titles AS equipped
        JOIN player_title_grants AS old_grant ON old_grant.id = equipped.grant_id
        JOIN gameplay_revisions AS old_revision ON old_revision.id = old_grant.gameplay_revision_id
        WHERE old_grant.gameplay_revision_id = ?
          AND old_revision.lifecycle = 'historical'
      )
      UPDATE player_equipped_titles
      SET grant_id = (
        SELECT replacement_grant_id FROM replacements
        WHERE old_grant_id = player_equipped_titles.grant_id
      )
      WHERE grant_id IN (SELECT old_grant_id FROM replacements WHERE replacement_grant_id IS NOT NULL)
    `).bind(revisionId),
    database.prepare(`
      DELETE FROM player_equipped_titles
      WHERE grant_id IN (
        SELECT grant.id
        FROM player_title_grants AS grant
        JOIN gameplay_revisions AS revision ON revision.id = grant.gameplay_revision_id
        WHERE grant.gameplay_revision_id = ?
          AND revision.lifecycle = 'historical'
      )
    `).bind(revisionId),
  ];
  type AdminRevisionAssignmentInput = Omit<AdminMapRevisionChallengeAssignment, "assignmentId" | "gameplayRevisionId" | "mapId">;
  const revisionChallengeFamilies = new Set(["map_challenge", "map_title_rule", "title_challenge"]);
  const revisionLifecycles = new Set(["preparing", "default", "selectable", "historical"]);
  const nullableEditorText = (value: string | null) => value?.trim() || null;

  const parseEditorSpatialConfig = (value: string | null) => {
    if (value === null) return null;
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      throw new Error("INVALID_SPATIAL_CONFIG");
    }
    return parseSpatialConfig(decoded);
  };

  const asAdminMapRevision = (
    row: typeof gameplayRevisions.$inferSelect,
    assignmentRows: Array<typeof gameplayRevisionChallengeAssignments.$inferSelect>,
  ): AdminMapRevision => {
    if (!revisionLifecycles.has(row.lifecycle)) throw new Error("INVALID_REVISION_LIFECYCLE");
    if (row.legacyMapVariant !== null && row.legacyMapVariant !== "classic") throw new Error("INVALID_MAP_VARIANT");
    const challengeAssignments = assignmentRows.map((assignment) => {
      if (assignment.gameplayRevisionId !== row.id || assignment.mapId !== row.mapId || !revisionChallengeFamilies.has(assignment.challengeFamily)) throw new Error("INVALID_REVISION_ASSIGNMENT");
      return {
        assignmentId: assignment.id,
        gameplayRevisionId: assignment.gameplayRevisionId,
        mapId: assignment.mapId,
        challengeFamily: assignment.challengeFamily as AdminMapRevisionChallengeAssignment["challengeFamily"],
        challengeId: assignment.challengeId,
        enabled: assignment.enabled === 1,
        condition: nullableEditorText(assignment.condition),
        evidenceRule: nullableEditorText(assignment.evidenceRule),
        submissionMode: assignment.submissionMode === null ? null : assignment.submissionMode as "manual" | "automatic",
        slot: assignment.slot === null ? null : assignment.slot as "pioneer" | "conqueror" | "dominator",
      };
    });
    return {
      revisionId: row.id,
      mapId: row.mapId,
      lifecycle: row.lifecycle as AdminMapRevision["lifecycle"],
      mapVariant: row.legacyMapVariant as "classic" | null,
      copiedFromRevisionId: row.copiedFromRevisionId,
      resetReason: nullableEditorText(row.resetReason),
      gameVersion: row.gameVersion,
      spatialConfig: parseEditorSpatialConfig(row.spatialConfigJson),
      isDefault: row.lifecycle === "default",
      isSelectable: row.lifecycle === "selectable",
      challengeAssignments,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };

  const loadAdminMapRevision = async (revisionId: string): Promise<AdminMapRevision> => {
    const row = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.id, revisionId)).get();
    if (!row) throw new Error("REVISION_NOT_FOUND");
    const assignments = await db.select().from(gameplayRevisionChallengeAssignments)
      .where(eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, revisionId))
      .orderBy(asc(gameplayRevisionChallengeAssignments.challengeFamily), asc(gameplayRevisionChallengeAssignments.challengeId));
    return asAdminMapRevision(row, assignments);
  };

  const loadAdminMapEditorChallengeCatalog = async (mapId: string): Promise<AdminMapEditorChallengeOption[]> => {
    const [mapChallengeRows, ruleRows, titleChallengeRows, exceptionRows] = await Promise.all([
      db.select().from(achievementChallenges).where(eq(achievementChallenges.mapId, mapId)),
      db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .where(and(inArray(mapTitleRules.status, ["active", "sunsetting"]), eq(titleCatalog.lifecycle, "active"))),
      db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .innerJoin(achievementChallengeMaps, eq(achievementChallengeMaps.challengeId, titleChallenges.id))
        .where(and(eq(achievementChallengeMaps.mapId, mapId), eq(titleChallenges.scope, "map"))),
      db.select().from(mapTitleRuleExceptions).where(eq(mapTitleRuleExceptions.mapId, mapId)),
    ]);
    const exceptionByRule = new globalThis.Map(exceptionRows.map((exception) => [exception.ruleId, exception]));
    return [
      ...mapChallengeRows.map((challenge): AdminMapEditorChallengeOption => ({
        challengeFamily: "map_challenge", challengeId: challenge.id, label: challenge.name, kind: challenge.type, status: challenge.status, gameVersion: challenge.gameVersion,
      })),
      ...ruleRows.filter(({ rule }) => {
        if (rule.kind.trim().toLocaleLowerCase() !== "pioneer") return true;
        const exception = exceptionByRule.get(rule.id);
        return rule.defaultScope === "explicit" && exception?.enabled === 1 && pioneerExceptionHasValidWindow(exception.startsAt, exception.endsAt) && exception.endsAt! > now();
      }).map(({ rule, title }): AdminMapEditorChallengeOption => ({
        challengeFamily: "map_title_rule", challengeId: rule.id, label: title.label, kind: rule.kind, status: rule.status, gameVersion: rule.introducedVersion,
      })),
      ...titleChallengeRows.filter(({ challenge, title }) => challenge.gameVersion?.trim() && title.gameVersion?.trim()).map(({ challenge, title }): AdminMapEditorChallengeOption => ({
        challengeFamily: "title_challenge", challengeId: challenge.id, label: title.label, kind: "title_challenge", status: challenge.status, gameVersion: challenge.gameVersion!,
      })),
    ].sort((left, right) => compareText(`${left.challengeFamily}:${left.label}:${left.challengeId}`, `${right.challengeFamily}:${right.label}:${right.challengeId}`));
  };

  const loadAdminMapEditorAudit = async (mapId: string, revisionIds: string[]) => {
    const entityFilter = revisionIds.length ? or(eq(auditEvents.entityId, mapId), inArray(auditEvents.entityId, revisionIds)) : eq(auditEvents.entityId, mapId);
    const rows = await db.select().from(auditEvents).where(and(
      inArray(auditEvents.operation, ["admin.map.metadata.update", "admin.map.revision.create", "admin.map.revision.update"]),
      entityFilter,
    )).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(100);
    return rows.map((row) => {
      let payload: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(row.payloadJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      } catch {
        payload = {};
      }
      return { operation: row.operation, actorType: row.actorType, actorId: row.actorId, entityType: row.entityType, entityId: row.entityId, payload, createdAt: row.createdAt };
    });
  };

  const loadAdminMap = async (mapId: string): Promise<Map | null> => {
    const row = await db.select({ map: maps, metadata: mapMetadata }).from(maps).leftJoin(mapMetadata, eq(mapMetadata.mapId, maps.id)).where(eq(maps.id, mapId)).get();
    if (!row) return null;
    return {
      mapId: row.map.id,
      mapName: row.map.name,
      gameVersion: row.map.gameVersion,
      difficultyRating: (row.metadata?.difficultyRating as Map["difficultyRating"]) ?? null,
      mechanics: row.metadata?.mechanicsJson ? JSON.parse(row.metadata.mechanicsJson) as string[] : [],
      coverUrl: row.metadata?.coverUrl ?? null,
      backgroundUrl: row.metadata?.backgroundUrl ?? null,
    };
  };

  const validateRevisionAssignments = async (
    mapId: string,
    assignments: AdminRevisionAssignmentInput[],
    existingAssignments: Array<typeof gameplayRevisionChallengeAssignments.$inferSelect> = [],
  ) => {
    const seen = new Set<string>();
    const existingByIdentity = new globalThis.Map(existingAssignments.map((assignment) => [
      `${assignment.challengeFamily}:${assignment.challengeId}`,
      assignment,
    ]));
    for (const assignment of assignments) {
      if (!revisionChallengeFamilies.has(assignment.challengeFamily)) throw new Error("INVALID_REVISION_ASSIGNMENT");
      const identity = `${assignment.challengeFamily}:${assignment.challengeId}`;
      if (seen.has(identity)) throw new Error("DUPLICATE_REVISION_ASSIGNMENT");
      seen.add(identity);
      const existing = existingByIdentity.get(identity);
      if (existing
        && existing.mapId === mapId
        && existing.enabled === (assignment.enabled ? 1 : 0)
        && nullableEditorText(existing.condition) === nullableEditorText(assignment.condition)
        && nullableEditorText(existing.evidenceRule) === nullableEditorText(assignment.evidenceRule)
        && existing.submissionMode === assignment.submissionMode
        && existing.slot === assignment.slot) continue;
      if (assignment.challengeFamily === "map_challenge") {
        const challenge = await db.select({ id: achievementChallenges.id, status: achievementChallenges.status }).from(achievementChallenges).where(and(eq(achievementChallenges.id, assignment.challengeId), eq(achievementChallenges.mapId, mapId))).get();
        if (!challenge) throw new Error("REVISION_CHALLENGE_NOT_FOUND");
        if (assignment.enabled && !["active", "sunsetting"].includes(challenge.status)) throw new Error("REVISION_CHALLENGE_NOT_ACTIVE");
      } else if (assignment.challengeFamily === "map_title_rule") {
        const rule = await db.select({ id: mapTitleRules.id, kind: mapTitleRules.kind, defaultScope: mapTitleRules.defaultScope, status: mapTitleRules.status }).from(mapTitleRules).where(eq(mapTitleRules.id, assignment.challengeId)).get();
        if (!rule) throw new Error("REVISION_CHALLENGE_NOT_FOUND");
        if (assignment.enabled && !["active", "sunsetting"].includes(rule.status)) throw new Error("REVISION_CHALLENGE_NOT_ACTIVE");
        if (assignment.enabled && rule.kind.trim().toLocaleLowerCase() === "pioneer") {
          const exception = await db.select({ enabled: mapTitleRuleExceptions.enabled, startsAt: mapTitleRuleExceptions.startsAt, endsAt: mapTitleRuleExceptions.endsAt }).from(mapTitleRuleExceptions).where(and(eq(mapTitleRuleExceptions.ruleId, rule.id), eq(mapTitleRuleExceptions.mapId, mapId))).get();
          if (rule.defaultScope !== "explicit" || exception?.enabled !== 1 || !pioneerExceptionHasValidWindow(exception.startsAt, exception.endsAt) || exception.endsAt! <= now()) throw new Error("REVISION_CHALLENGE_NOT_ASSIGNABLE");
        }
      } else {
        const challenge = await db.select({ id: titleChallenges.id, status: titleChallenges.status }).from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .innerJoin(achievementChallengeMaps, eq(achievementChallengeMaps.challengeId, titleChallenges.id))
          .where(and(eq(titleChallenges.id, assignment.challengeId), eq(achievementChallengeMaps.mapId, mapId), eq(titleChallenges.scope, "map"))).get();
        if (!challenge) throw new Error("REVISION_CHALLENGE_NOT_FOUND");
        if (assignment.enabled && !["scheduled", "active", "sunsetting"].includes(challenge.status)) throw new Error("REVISION_CHALLENGE_NOT_ACTIVE");
      }
    }
  };

  const assertRevisionLifecycle = (current: string, next: AdminMapRevisionUpdateRequest["lifecycle"]) => {
    const allowed: Record<string, string[]> = {
      preparing: ["preparing", "default", "selectable", "historical"],
      default: ["default", "selectable", "historical"],
      selectable: ["selectable", "default", "historical"],
      historical: ["historical", "selectable"],
    };
    if (!allowed[current]?.includes(next)) throw new Error("INVALID_REVISION_TRANSITION");
  };

  const assertRevisionConfiguration = (lifecycle: AdminMapRevisionUpdateRequest["lifecycle"], mapVariant: "classic" | null, spatialConfig: AdminMapRevisionUpdateRequest["spatialConfig"]) => {
    if (lifecycle === "default" && mapVariant !== null) throw new Error("DEFAULT_REVISION_CANNOT_USE_CLASSIC_VARIANT");
    if ((lifecycle === "default" || lifecycle === "selectable") && !spatialConfig) throw new Error("INVALID_SPATIAL_CONFIG");
    const parsed = spatialConfig ? parseSpatialConfig(spatialConfig) : null;
    if ((lifecycle === "default" || lifecycle === "selectable") && parsed && !agentProjectedSpatialConfigSchema.safeParse(parsed).success) {
      throw new Error("INVALID_SPATIAL_CONFIG");
    }
    return parsed;
  };

  return {
    async listMaps() {
      const rows = await db.select({ map: maps, metadata: mapMetadata, defaultRevisionId: gameplayRevisions.id }).from(maps)
        .leftJoin(mapMetadata, eq(mapMetadata.mapId, maps.id))
        .leftJoin(gameplayRevisions, and(eq(gameplayRevisions.mapId, maps.id), eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant)))
        .where(eq(maps.status, "active")).orderBy(maps.name);
      return rows.map(({ map, metadata, defaultRevisionId }): Map => ({
          mapId: map.id,
          mapName: map.name,
          defaultGameplayRevisionId: defaultRevisionId,
          gameVersion: map.gameVersion,
          difficultyRating: (metadata?.difficultyRating as Map["difficultyRating"]) ?? null,
          mechanics: metadata?.mechanicsJson ? JSON.parse(metadata.mechanicsJson) as string[] : [],
          coverUrl: metadata?.coverUrl ?? null,
          backgroundUrl: metadata?.backgroundUrl ?? null,
      }));
    },

    async updateAdminMapMetadata(input: AdminMapMetadataUpdateRequest & { mapId: string }, auth, idempotencyKey) {
      const replay = await replayOrConflict<Map>(auth.subject, "admin.map.metadata.update", idempotencyKey, input);
      if (replay) return replay;
      const map = await db.select().from(maps).where(eq(maps.id, input.mapId)).get();
      if (!map) throw new Error("MAP_NOT_FOUND");
      const mechanics = [...new Set(input.mechanics.map((value) => value.trim()).filter(Boolean))];
      const timestamp = now();
      await db.update(maps).set({ gameVersion: input.gameVersion, updatedAt: timestamp }).where(eq(maps.id, input.mapId));
      await db.insert(mapMetadata).values({ mapId: input.mapId, difficultyRating: input.difficultyRating, mechanicsJson: JSON.stringify(mechanics), coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl, updatedAt: timestamp, updatedBy: auth.subject }).onConflictDoUpdate({ target: mapMetadata.mapId, set: { difficultyRating: input.difficultyRating, mechanicsJson: JSON.stringify(mechanics), coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl, updatedAt: timestamp, updatedBy: auth.subject } });
      const response: Map = { mapId: map.id, mapName: map.name, gameVersion: input.gameVersion, difficultyRating: input.difficultyRating, mechanics, coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl };
      await recordIdempotency(auth.subject, "admin.map.metadata.update", idempotencyKey, input, response);
      await recordAudit(auth, "admin.map.metadata.update", "map_metadata", input.mapId, { gameVersion: input.gameVersion, difficultyRating: input.difficultyRating, mechanics, coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl });
      return response;
    },

    async getAdminMapEditor(input) {
      const map = await loadAdminMap(input.mapId);
      if (!map) throw new Error("MAP_NOT_FOUND");
      const revisionRows = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.mapId, input.mapId)).orderBy(asc(gameplayRevisions.createdAt), asc(gameplayRevisions.id));
      const revisions = await Promise.all(revisionRows.map((row) => loadAdminMapRevision(row.id)));
      const [challengeCatalog, audit] = await Promise.all([
        loadAdminMapEditorChallengeCatalog(input.mapId),
        loadAdminMapEditorAudit(input.mapId, revisions.map((revision) => revision.revisionId)),
      ]);
      return { contractVersion: "1" as const, map, revisions, challengeCatalog, audit } satisfies AdminMapEditorResponse;
    },

    async createAdminMapRevision(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminMapRevision>(auth.subject, "admin.map.revision.create", idempotencyKey, input);
      if (replay) return replay;
      const map = await db.select().from(maps).where(eq(maps.id, input.mapId)).get();
      if (!map) throw new Error("MAP_NOT_FOUND");

      let source: typeof gameplayRevisions.$inferSelect | null = null;
      if (input.sourceRevisionId) {
        source = await db.select().from(gameplayRevisions).where(and(eq(gameplayRevisions.id, input.sourceRevisionId), eq(gameplayRevisions.mapId, input.mapId))).get() ?? null;
        if (!source) throw new Error("REVISION_SOURCE_NOT_FOUND");
      } else if (input.copyConfiguration) {
        source = await db.select().from(gameplayRevisions).where(and(eq(gameplayRevisions.mapId, input.mapId), eq(gameplayRevisions.lifecycle, "default"))).get() ?? null;
        if (!source) throw new Error("REVISION_SOURCE_NOT_FOUND");
      }
      const gameVersion = input.gameVersion ?? formatCurrentGameVersion();
      const resetReason = input.resetReason ?? null;

      const sourceAssignments = source
        ? await db.select().from(gameplayRevisionChallengeAssignments).where(eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, source.id)).orderBy(asc(gameplayRevisionChallengeAssignments.challengeFamily), asc(gameplayRevisionChallengeAssignments.challengeId))
        : [];
      const assignments: AdminRevisionAssignmentInput[] = input.copyConfiguration
        ? sourceAssignments.filter((assignment) => !["map_title_rule", "title_challenge"].includes(assignment.challengeFamily)).map((assignment) => ({
          challengeFamily: assignment.challengeFamily as AdminRevisionAssignmentInput["challengeFamily"],
          challengeId: assignment.challengeId,
          enabled: assignment.enabled === 1,
          condition: nullableEditorText(assignment.condition),
          evidenceRule: nullableEditorText(assignment.evidenceRule),
          submissionMode: assignment.submissionMode === null ? null : assignment.submissionMode as "manual" | "automatic",
          slot: assignment.slot === null ? null : assignment.slot as "pioneer" | "conqueror" | "dominator",
        }))
        : input.challengeAssignments ?? [];
      const spatialConfig = input.copyConfiguration
        ? parseEditorSpatialConfig(source?.spatialConfigJson ?? null)
        : input.spatialConfig ? parseSpatialConfig(input.spatialConfig) : null;
      await validateRevisionAssignments(input.mapId, assignments);
      if (input.mapVariant === "classic") {
        const existingClassic = await db.select({ id: gameplayRevisions.id }).from(gameplayRevisions).where(and(eq(gameplayRevisions.mapId, input.mapId), eq(gameplayRevisions.legacyMapVariant, "classic"))).get();
        if (existingClassic) throw new Error("LEGACY_VARIANT_CONFLICT");
      }

      const timestamp = now();
      const revisionId = `revision:${input.mapId}:${crypto.randomUUID()}`;
      const statements = [database.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES (?, ?, 'preparing', ?, ?, ?, ?, ?, ?, ?)").bind(
        revisionId, input.mapId, input.mapVariant, source?.id ?? input.sourceRevisionId ?? null, resetReason, gameVersion, spatialConfig ? JSON.stringify(spatialConfig) : null, timestamp, timestamp,
      )];
      for (const assignment of assignments) {
        statements.push(database.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
          `assignment:${revisionId}:${crypto.randomUUID()}`, revisionId, input.mapId, assignment.challengeFamily, assignment.challengeId, assignment.enabled ? 1 : 0, assignment.condition, assignment.evidenceRule, assignment.submissionMode, assignment.slot, timestamp, timestamp,
        ));
      }
      await database.batch(statements);
      const response = await loadAdminMapRevision(revisionId);
      await recordIdempotency(auth.subject, "admin.map.revision.create", idempotencyKey, input, response);
      await recordAudit(auth, "admin.map.revision.create", "gameplay_revision", revisionId, {
        sourceRevisionId: source?.id ?? input.sourceRevisionId ?? null,
        gameVersionSourceMapId: map.id,
        gameVersion,
        resetReason,
        copyConfiguration: input.copyConfiguration,
        copiedAssignmentCount: input.copyConfiguration ? assignments.length : 0,
        progressCopied: false,
      });
      return response;
    },

    async updateAdminMapRevision(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminMapRevision>(auth.subject, "admin.map.revision.update", idempotencyKey, input);
      if (replay) return replay;
      const current = await db.select().from(gameplayRevisions).where(and(eq(gameplayRevisions.id, input.revisionId), eq(gameplayRevisions.mapId, input.mapId))).get();
      if (!current) throw new Error("REVISION_NOT_FOUND");
      if ((current.lifecycle === "default") !== (input.lifecycle === "default")) throw new Error("REVISION_PROMOTION_REQUIRES_EXPLICIT_OPERATION");
      assertRevisionLifecycle(current.lifecycle, input.lifecycle);
      const spatialConfig = assertRevisionConfiguration(input.lifecycle, input.mapVariant, input.spatialConfig);
      const currentAssignments = await db.select().from(gameplayRevisionChallengeAssignments)
        .where(eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, input.revisionId));
      await validateRevisionAssignments(input.mapId, input.challengeAssignments, currentAssignments);

      if (input.mapVariant === "classic") {
        const otherClassic = await db.select({ id: gameplayRevisions.id }).from(gameplayRevisions).where(and(eq(gameplayRevisions.mapId, input.mapId), eq(gameplayRevisions.legacyMapVariant, "classic"), ne(gameplayRevisions.id, input.revisionId))).get();
        if (otherClassic) throw new Error("LEGACY_VARIANT_CONFLICT");
      }

      const becomesClassicMapRevision = input.lifecycle === "selectable" && input.mapVariant === "classic";
      const activeMap = becomesClassicMapRevision
        ? await db.select({ id: maps.id }).from(maps).where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get()
        : null;
      const defaultMapTitleRules = activeMap
        ? await db.select().from(mapTitleRules).where(and(
          eq(mapTitleRules.defaultScope, "all_active"),
          inArray(mapTitleRules.status, ["active", "sunsetting"]),
          input.mapVariant === "classic" ? eq(mapTitleRules.mapVariant, "classic") : isNull(mapTitleRules.mapVariant),
        ))
        : [];

      const timestamp = now();
      const statements = [
        database.prepare("UPDATE gameplay_revisions SET lifecycle = ?, legacy_map_variant = ?, game_version = ?, spatial_config_json = ?, updated_at = ? WHERE id = ? AND map_id = ?").bind(
          input.lifecycle, input.mapVariant, input.gameVersion, spatialConfig ? JSON.stringify(spatialConfig) : null, timestamp, input.revisionId, input.mapId,
        ),
        database.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ?").bind(input.revisionId),
      ];
      for (const assignment of input.challengeAssignments) {
        statements.push(database.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
          `assignment:${input.revisionId}:${crypto.randomUUID()}`, input.revisionId, input.mapId, assignment.challengeFamily, assignment.challengeId, assignment.enabled ? 1 : 0, assignment.condition, assignment.evidenceRule, assignment.submissionMode, assignment.slot, timestamp, timestamp,
        ));
      }
      for (const rule of defaultMapTitleRules) {
        if (rule.kind.trim().toLocaleLowerCase() !== "pioneer") {
          statements.push(insertDefaultMapTitleRuleAssignment(input.revisionId, input.mapId, rule.id, timestamp));
        }
      }
      if (current.lifecycle === "selectable" && input.lifecycle === "historical") {
        statements.push(...reconcileEquippedTitlesForHistoricalRevision(input.revisionId));
      }
      await database.batch(statements);
      const response = await loadAdminMapRevision(input.revisionId);
      await recordIdempotency(auth.subject, "admin.map.revision.update", idempotencyKey, input, response);
      await recordAudit(auth, "admin.map.revision.update", "gameplay_revision", input.revisionId, {
        previousLifecycle: current.lifecycle,
        lifecycle: input.lifecycle,
        gameVersion: input.gameVersion,
        assignmentCount: input.challengeAssignments.length,
        spatialConfigUpdated: true,
        progressCopied: false,
      });
      return response;
    },

    async promoteAdminMapRevision(input, auth, idempotencyKey) {
      const operation = "admin.map.revision.promote";
      const replay = await replayOrConflict<AdminMapRevision>(auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const current = await db.select().from(gameplayRevisions).where(and(
        eq(gameplayRevisions.id, input.revisionId),
        eq(gameplayRevisions.mapId, input.mapId),
      )).get();
      if (!current) throw new Error("REVISION_NOT_FOUND");
      if (!["preparing", "selectable", "default"].includes(current.lifecycle)) throw new Error("REVISION_NOT_PROMOTABLE");
      if (current.legacyMapVariant !== null) throw new Error("DEFAULT_REVISION_CANNOT_USE_CLASSIC_VARIANT");
      const map = await db.select().from(maps).where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get();
      if (!map) throw new Error("MAP_NOT_FOUND");
      const spatialConfig = current.spatialConfigJson ? parseSpatialConfig(JSON.parse(current.spatialConfigJson)) : null;
      assertRevisionConfiguration("default", null, spatialConfig);
      const assignmentRows = await db.select().from(gameplayRevisionChallengeAssignments)
        .where(eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, input.revisionId));
      const assignments = assignmentRows.map((assignment) => ({
        challengeFamily: assignment.challengeFamily as AdminMapRevisionUpdateRequest["challengeAssignments"][number]["challengeFamily"],
        challengeId: assignment.challengeId,
        enabled: assignment.enabled === 1,
        condition: assignment.condition,
        evidenceRule: assignment.evidenceRule,
        submissionMode: assignment.submissionMode as AdminMapRevisionUpdateRequest["challengeAssignments"][number]["submissionMode"],
        slot: assignment.slot as AdminMapRevisionUpdateRequest["challengeAssignments"][number]["slot"],
      }));
      await validateRevisionAssignments(input.mapId, assignments);
      const otherDefault = current.lifecycle === "default" ? null : await db.select().from(gameplayRevisions).where(and(
        eq(gameplayRevisions.mapId, input.mapId),
        eq(gameplayRevisions.lifecycle, "default"),
      )).get() ?? null;
      if (current.lifecycle !== "default" && otherDefault && !input.replacedDefaultLifecycle) throw new Error("DEFAULT_REVISION_REPLACEMENT_REQUIRED");
      if (current.lifecycle !== "default" && !otherDefault && input.replacedDefaultLifecycle) throw new Error("DEFAULT_REVISION_REPLACEMENT_NOT_FOUND");
      const timestamp = now();
      const defaultMapTitleRules = current.lifecycle === "default" ? [] : await db.select().from(mapTitleRules).where(and(
        eq(mapTitleRules.defaultScope, "all_active"),
        inArray(mapTitleRules.status, ["active", "sunsetting"]),
        isNull(mapTitleRules.mapVariant),
      ));
      const projectedRuleAssignments = defaultMapTitleRules
        .filter((rule) => rule.kind.trim().toLocaleLowerCase() !== "pioneer")
        .filter((rule) => !assignmentRows.some((assignment) => assignment.challengeFamily === "map_title_rule" && assignment.challengeId === rule.id))
        .map((rule) => ({
          id: `assignment:${input.revisionId}:map_title_rule:${rule.id}`,
          gameplayRevisionId: input.revisionId,
          mapId: input.mapId,
          challengeFamily: "map_title_rule",
          challengeId: rule.id,
          enabled: 1,
          condition: null,
          evidenceRule: null,
          submissionMode: null,
          slot: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
      const response = asAdminMapRevision(
        { ...current, lifecycle: "default", updatedAt: timestamp },
        [...assignmentRows, ...projectedRuleAssignments],
      );
      const requestHash = await hashRequest(input);
      const statements = [
        ...(otherDefault ? [database.prepare("UPDATE gameplay_revisions SET lifecycle = ?, updated_at = ? WHERE id = ? AND map_id = ? AND lifecycle = 'default'").bind(
          input.replacedDefaultLifecycle, timestamp, otherDefault.id, input.mapId,
        )] : []),
        ...(current.lifecycle === "default" ? [] : [database.prepare("UPDATE gameplay_revisions SET lifecycle = 'default', updated_at = ? WHERE id = ? AND map_id = ? AND lifecycle IN ('preparing', 'selectable')").bind(timestamp, input.revisionId, input.mapId)]),
        ...projectedRuleAssignments.map((assignment) => insertDefaultMapTitleRuleAssignment(input.revisionId, input.mapId, assignment.challengeId, timestamp)),
        ...(otherDefault && input.replacedDefaultLifecycle === "historical" ? reconcileEquippedTitlesForHistoricalRevision(otherDefault.id) : []),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
          `${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, requestHash, JSON.stringify(response), timestamp,
        ),
        ...(current.lifecycle === "default" ? [] : [
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'gameplay_revision', ?, ?, ?)").bind(
            crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, input.revisionId,
            JSON.stringify({ previousLifecycle: current.lifecycle, lifecycle: "default", replacedDefaultRevisionId: otherDefault?.id ?? null, replacedDefaultLifecycle: input.replacedDefaultLifecycle ?? null, progressCopied: false }),
            timestamp,
          ),
          ...(otherDefault ? [database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'gameplay_revision', ?, ?, ?)").bind(
            crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, otherDefault.id,
            JSON.stringify({ previousLifecycle: "default", lifecycle: input.replacedDefaultLifecycle, replacedByRevisionId: input.revisionId, progressCopied: false }),
            timestamp,
          )] : []),
        ]),
      ];
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      return response;
    },

  };
};
