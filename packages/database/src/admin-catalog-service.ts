import { and, eq, inArray, isNull, ne, notExists } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { deriveTitleAvailability, parseChallengeProgressRule } from "@owbastion/domain";
import { createAdminTitleServices } from "./admin-title-service";
import type { AuthContext, ChallengeProgressRule, PlatformServices } from "@owbastion/domain";
import type { AdminChallenge, AdminMapTitleRule, AdminMapTitleRuleCreateRequest, AdminMapTitleRuleExceptionUpsertRequest, AdminMapTitleRuleUpdateRequest, AgentTitle } from "@owbastion/contracts";
import { hashRequest } from "./portal-session";
import type { createChallengeCatalogServices } from "./challenge-catalog-service";
import type { createChallengeSnapshotServices } from "./challenge-snapshot-service";
import {
  achievementChallenges,
  gameplayRevisionChallengeAssignments,
  gameplayRevisions,
  mapTitleRuleCompat,
  mapTitleRuleExceptions,
  mapTitleRules,
  maps,
  titleCatalog,
  titleChallenges,
} from "./schema";

type Database = ReturnType<typeof drizzle>;

const maxTitleIconBytes = 512 * 1024;
const titleIconContentTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);

// Every configured way to obtain a Title: a title_challenge row, a map title
// rule, or a map challenge that rewards it. Title obtainability is derived
// from these paths, never stored on the title.
type TitleAcquisitionPath = { status: string; startsAt: number | null; endsAt: number | null; retiredVersion: string | null };

type ChallengeCatalogServices = Pick<ReturnType<typeof createChallengeCatalogServices>,
  | "enabledMapChallengeAssignment"
  | "loadChallengeMapIds"
  | "loadMapScopedTitleChallenges"
  | "loadMapTitleRuleChallenges"
  | "loadTitleChallengeRevisions"
  | "toPublicMapChallenge"
  | "toTitleChallengeBase"
  | "validateChallengeMapScope"
>;
type ChallengeSnapshotServices = Pick<ReturnType<typeof createChallengeSnapshotServices>, "resolveMapTitleProjection">;
type AdminCatalogServices = Pick<PlatformServices,
  | "listAdminChallenges"
  | "listAdminMapTitleRules"
  | "createAdminMapTitleRule"
  | "updateAdminMapTitleRule"
  | "listAdminMapTitleInheritance"
  | "upsertAdminMapTitleRuleException"
  | "listAdminTitleSummaries"
  | "createAdminTitle"
  | "listAdminTitleChallenges"
  | "createAdminTitleChallenge"
  | "updateAdminChallengeLifecycle"
  | "updateAdminChallenge"
  | "updateAdminCatalogTitle"
  | "uploadAdminTitleIcon"
  | "getPublicTitleIcon"
>;
type AdminCatalogServicesDependencies = {
  database: D1Database;
  db: Database;
  now: () => number;
  evidenceBucket?: R2Bucket;
  uploadOrigin: string;
  replayOrConflict: <T>(db: Database, actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (db: Database, actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (db: Database, auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
  titleIconVersionOf: (objectKey: string) => string;
  toAgentTitle: (row: typeof titleCatalog.$inferSelect) => AgentTitle;
  insertDefaultMapTitleRuleAssignment: (revisionId: string, mapId: string, ruleId: string, timestamp: number) => D1PreparedStatement;
  latestBuildVersion: () => Promise<string>;
  assertProgressRuleTargets: (rule: { mapIds?: string[]; mode?: string }) => Promise<void>;
  reconcileProgressChallengePlayers: (input: { challenge: typeof titleChallenges.$inferSelect; rule: ChallengeProgressRule; actorId: string; reason?: string | null }) => Promise<void>;
  challengeCatalog: ChallengeCatalogServices;
  challengeSnapshot: ChallengeSnapshotServices;
};

export const createAdminCatalogServices = ({
  database,
  db,
  now,
  evidenceBucket,
  uploadOrigin,
  replayOrConflict,
  recordIdempotency,
  recordAudit,
  titleIconVersionOf,
  toAgentTitle,
  insertDefaultMapTitleRuleAssignment,
  latestBuildVersion,
  assertProgressRuleTargets,
  reconcileProgressChallengePlayers,
  challengeCatalog,
  challengeSnapshot,
}: AdminCatalogServicesDependencies): AdminCatalogServices => {
  const {
    enabledMapChallengeAssignment,
    loadChallengeMapIds,
    loadMapScopedTitleChallenges,
    loadMapTitleRuleChallenges,
    toPublicMapChallenge,
    toTitleChallengeBase,
  } = challengeCatalog;
  const { resolveMapTitleProjection } = challengeSnapshot;

  const asAdminMapTitleRule = (rule: typeof mapTitleRules.$inferSelect, titleName: string): AdminMapTitleRule => ({
    ruleId: rule.id,
    titleKey: rule.titleKey,
    titleName,
    kind: rule.kind,
    condition: rule.condition,
    evidenceRule: rule.evidenceRule,
    submissionMode: rule.submissionMode as "manual" | "automatic",
    displayKind: rule.displayKind as "fixed" | "map_pioneer" | "map_name_suffix",
    slot: rule.slot as "pioneer" | "conqueror" | "dominator" | null,
    defaultScope: rule.defaultScope as "all_active" | "explicit",
    ...(rule.mapVariant ? { mapVariant: rule.mapVariant as "classic" } : {}),
    status: rule.status as "draft" | "active" | "archived",
    introducedVersion: rule.introducedVersion,
    retiredVersion: rule.retiredVersion,
  });

  const assertMapTitleRuleScope = (kind: string, defaultScope: string) => {
    if (kind.trim().toLocaleLowerCase() === "pioneer" && defaultScope !== "explicit") throw new Error("PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT");
  };

  const materializeDefaultMapTitleRuleAssignments = async (rule: typeof mapTitleRules.$inferSelect) => {
    if (rule.status !== "active" || rule.defaultScope !== "all_active" || rule.kind.trim().toLocaleLowerCase() === "pioneer") return;
    const mapVariant = (rule.mapVariant as "classic" | null) ?? null;
    const revisions = await db.select({ revision: gameplayRevisions }).from(gameplayRevisions)
      .innerJoin(maps, eq(gameplayRevisions.mapId, maps.id))
      .where(and(eq(maps.status, "active"), mapVariant === "classic" ? and(eq(gameplayRevisions.lifecycle, "selectable"), eq(gameplayRevisions.legacyMapVariant, "classic")) : and(eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant))));
    if (!revisions.length) return;
    const timestamp = now();
    await database.batch(revisions.map(({ revision }) => insertDefaultMapTitleRuleAssignment(revision.id, revision.mapId, rule.id, timestamp)));
  };

  const { updateTitleChallenge, ...titleServices } = createAdminTitleServices({ database, evidenceBucket, db, now, replayOrConflict, latestBuildVersion, assertProgressRuleTargets, reconcileProgressChallengePlayers, challengeCatalog });

  return {
    ...titleServices,
    async listAdminChallenges(input) {
      const items: AdminChallenge[] = [];
      if (!input.family || input.family === "map") {
        const rows = await db.select({ challenge: achievementChallenges, map: maps, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .innerJoin(gameplayRevisionChallengeAssignments, enabledMapChallengeAssignment())
          .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
          .where(and(
            input.status ? eq(achievementChallenges.status, input.status) : undefined,
            eq(gameplayRevisions.mapId, achievementChallenges.mapId),
            inArray(gameplayRevisions.lifecycle, ["default", "selectable", "historical"]),
            notExists(db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId })
              .from(mapTitleRuleCompat)
              .where(and(
                eq(mapTitleRuleCompat.legacyChallengeId, achievementChallenges.id),
                eq(mapTitleRuleCompat.mapId, achievementChallenges.mapId),
              )))
          ))
          .orderBy(maps.name, achievementChallenges.name);
        items.push(...rows.map(({ challenge, map, assignment, revision }): AdminChallenge => ({
          ...toPublicMapChallenge(challenge, map, assignment, revision),
          gameVersion: challenge.gameVersion,
          status: challenge.status as "draft" | "active" | "archived",
          introducedVersion: challenge.introducedVersion,
          retiredVersion: challenge.retiredVersion,
        })));
        const ruleItems = await loadMapTitleRuleChallenges(true, now(), false, "definition");
        items.push(...ruleItems.filter((item) => !input.status || item.status === input.status).map((item) => ({
          ...item,
          condition: item.condition!, evidenceRule: item.evidenceRule!, submissionMode: item.submissionMode!,
          introducedVersion: item.gameVersion, retiredVersion: item.retiredVersion ?? null,
        }) as AdminChallenge));
        const scopedTitleItems = await loadMapScopedTitleChallenges(now(), false, "definition", true);
        items.push(...scopedTitleItems.filter((item) => !input.status || item.status === input.status).map((item) => ({
          ...item,
          condition: item.condition!, evidenceRule: item.evidenceRule!, submissionMode: item.submissionMode!,
          introducedVersion: item.gameVersion, retiredVersion: item.retiredVersion ?? null,
        }) as AdminChallenge));
      }
      if (!input.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(input.status ? eq(titleChallenges.status, input.status) : undefined)
          .orderBy(titleCatalog.category, titleCatalog.label);
        const mapScopedIds = rows.filter(({ challenge }) => (challenge.scope ?? "global") === "map").map(({ challenge }) => challenge.id);
        const mapIdsByChallenge = await loadChallengeMapIds(mapScopedIds);
        items.push(...rows.filter(({ challenge }) => !((challenge.scope ?? "global") === "map" && challenge.mapVariant)).map(({ challenge, title }): AdminChallenge => ({
          ...toTitleChallengeBase(challenge, title),
          categoryOverride: challenge.categoryOverride,
          gameVersion: challenge.gameVersion,
          status: challenge.status as "draft" | "active" | "archived",
          introducedVersion: challenge.introducedVersion,
          retiredVersion: challenge.retiredVersion,
          startsAt: challenge.startsAt,
          endsAt: challenge.endsAt,
          scope: (challenge.scope ?? "global") as "global" | "map",
          mapIds: (challenge.scope ?? "global") === "map" ? (mapIdsByChallenge.get(challenge.id) ?? []) : [],
          ...(challenge.mapVariant ? { mapVariant: challenge.mapVariant as "classic" } : {}),
          ...(parseChallengeProgressRule(challenge.progressRule) ? { progressRule: parseChallengeProgressRule(challenge.progressRule)! } : {}),
        })));
      }
      if (!input.family) {
        const rows = await db.select({ title: titleCatalog, challenge: titleChallenges })
          .from(titleCatalog)
          .leftJoin(titleChallenges, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(input.status ? eq(titleCatalog.lifecycle, input.status === "archived" ? "retired" : input.status) : undefined);
        const catalogTitles = new Map<string, { title: typeof titleCatalog.$inferSelect; paths: TitleAcquisitionPath[] }>();
        for (const { title, challenge } of rows) {
          const entry = catalogTitles.get(title.key) ?? { title, paths: [] };
          if (challenge) entry.paths.push({ status: challenge.status, startsAt: challenge.startsAt, endsAt: challenge.endsAt, retiredVersion: challenge.retiredVersion });
          catalogTitles.set(title.key, entry);
        }
        const titleKeys = [...catalogTitles.keys()];
        if (titleKeys.length) {
          const [rulePaths, rewardPaths] = await Promise.all([
            db.select({ titleKey: mapTitleRules.titleKey, status: mapTitleRules.status, retiredVersion: mapTitleRules.retiredVersion }).from(mapTitleRules).where(inArray(mapTitleRules.titleKey, titleKeys)),
            db.select({ titleKey: achievementChallenges.rewardTitleKey, status: achievementChallenges.status, retiredVersion: achievementChallenges.retiredVersion }).from(achievementChallenges).where(inArray(achievementChallenges.rewardTitleKey, titleKeys)),
          ]);
          for (const path of rulePaths) catalogTitles.get(path.titleKey)?.paths.push({ status: path.status, startsAt: null, endsAt: null, retiredVersion: path.retiredVersion });
          for (const path of rewardPaths) if (path.titleKey) catalogTitles.get(path.titleKey)?.paths.push({ status: path.status, startsAt: null, endsAt: null, retiredVersion: path.retiredVersion });
        }
        const timestamp = now();
        items.push(...[...catalogTitles.values()].map(({ title, paths }): AdminChallenge => {
          const { label: titleName, availability: _storedAvailability, ...titleFields } = toAgentTitle(title);
          return {
            ...titleFields,
            challengeId: `title.${title.key}`,
            family: "title_catalog",
            type: "title_catalog",
            titleName,
            publicVisibility: title.publicVisibility === 1,
            availability: deriveTitleAvailability(paths, timestamp),
            gameVersion: title.gameVersion,
            hasChallenge: paths.length > 0,
          };
        }));
      }
      return { contractVersion: "1" as const, items };
    },

    async listAdminMapTitleRules() {
      const rows = await db.select({ rule: mapTitleRules, title: titleCatalog })
        .from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .orderBy(mapTitleRules.kind);
      return { contractVersion: "1" as const, items: rows.map(({ rule, title }) => asAdminMapTitleRule(rule, title.label)) };
    },

    async createAdminMapTitleRule(input: AdminMapTitleRuleCreateRequest, auth, idempotencyKey) {
      assertMapTitleRuleScope(input.kind, input.defaultScope);
      const replay = await replayOrConflict<AdminMapTitleRule>(db, auth.subject, "admin.map-title-rule.create", idempotencyKey, input);
      if (replay) return replay;
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title || title.scope !== "map") throw new Error("MAP_TITLE_NOT_FOUND");
      const existing = await db.select({ id: mapTitleRules.id }).from(mapTitleRules).where(eq(mapTitleRules.kind, input.kind)).get();
      if (existing) throw new Error("MAP_TITLE_RULE_KIND_CONFLICT");
      const timestamp = now();
      const rule = { id: crypto.randomUUID(), titleKey: input.titleKey, kind: input.kind, condition: input.condition, evidenceRule: input.evidenceRule, submissionMode: input.submissionMode, displayKind: input.displayKind, slot: input.slot, mapVariant: input.mapVariant ?? null, defaultScope: input.defaultScope, status: input.status, introducedVersion: input.introducedVersion, retiredVersion: input.status === "active" ? input.retiredVersion ?? null : null, createdAt: timestamp, updatedAt: timestamp };
      await db.insert(mapTitleRules).values(rule);
      await materializeDefaultMapTitleRuleAssignments(rule);
      const response = asAdminMapTitleRule(rule, title.label);
      await recordIdempotency(db, auth.subject, "admin.map-title-rule.create", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.map-title-rule.create", "map_title_rule", rule.id, input);
      return response;
    },

    async updateAdminMapTitleRule(input: AdminMapTitleRuleUpdateRequest & { ruleId: string }, auth, idempotencyKey) {
      assertMapTitleRuleScope(input.kind, input.defaultScope);
      const replay = await replayOrConflict<AdminMapTitleRule>(db, auth.subject, "admin.map-title-rule.update", idempotencyKey, input);
      if (replay) return replay;
      const row = await db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key)).where(eq(mapTitleRules.id, input.ruleId)).get();
      if (!row) throw new Error("MAP_TITLE_RULE_NOT_FOUND");
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title || title.scope !== "map") throw new Error("MAP_TITLE_NOT_FOUND");
      const conflict = await db.select({ id: mapTitleRules.id }).from(mapTitleRules).where(and(eq(mapTitleRules.kind, input.kind), ne(mapTitleRules.id, input.ruleId))).get();
      if (conflict) throw new Error("MAP_TITLE_RULE_KIND_CONFLICT");
      const updatedAt = now();
      const next = { ...row.rule, titleKey: input.titleKey, kind: input.kind, condition: input.condition, evidenceRule: input.evidenceRule, submissionMode: input.submissionMode, displayKind: input.displayKind, slot: input.slot, mapVariant: input.mapVariant ?? null, defaultScope: input.defaultScope, status: input.status, introducedVersion: input.introducedVersion, retiredVersion: input.status === "active" ? input.retiredVersion ?? null : null, updatedAt };
      await db.update(mapTitleRules).set(next).where(eq(mapTitleRules.id, input.ruleId));
      await materializeDefaultMapTitleRuleAssignments(next);
      const response = asAdminMapTitleRule(next, title.label);
      await recordIdempotency(db, auth.subject, "admin.map-title-rule.update", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.map-title-rule.update", "map_title_rule", input.ruleId, input);
      return response;
    },

    async listAdminMapTitleInheritance(input) {
      const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
      if (!map) throw new Error("MAP_NOT_FOUND");
      const rows = await db.select({ rule: mapTitleRules, title: titleCatalog, exception: mapTitleRuleExceptions })
        .from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .leftJoin(mapTitleRuleExceptions, and(eq(mapTitleRuleExceptions.ruleId, mapTitleRules.id), eq(mapTitleRuleExceptions.mapId, input.mapId)))
        .orderBy(mapTitleRules.kind);
      const items = await Promise.all(rows.map(async ({ rule, title, exception }) => {
        const projection = await resolveMapTitleProjection(rule.id, input.mapId);
        return { mapId: input.mapId, rule: asAdminMapTitleRule(rule, title.label), projected: projection !== null, source: "map_title_rule" as const,
          effective: projection ? { condition: projection.condition, evidenceRule: projection.evidenceRule, submissionMode: projection.submissionMode as "manual" | "automatic", slot: projection.slot as "pioneer" | "conqueror" | "dominator" | null } : null,
          exception: exception ? { exceptionId: exception.id, ruleId: exception.ruleId, mapId: exception.mapId, enabled: exception.enabled === 1, condition: exception.condition, evidenceRule: exception.evidenceRule, submissionMode: exception.submissionMode as "manual" | "automatic" | null, slot: exception.slot as "pioneer" | "conqueror" | "dominator" | null, startsAt: exception.startsAt, endsAt: exception.endsAt } : null };
      }));
      return { contractVersion: "1" as const, items };
    },

    async upsertAdminMapTitleRuleException(input: AdminMapTitleRuleExceptionUpsertRequest & { mapId: string; ruleId: string }, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.map-title-rule-exception.upsert", idempotencyKey, input);
      if (replay) return;
      const [map, rule] = await Promise.all([db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get(), db.select({ id: mapTitleRules.id, kind: mapTitleRules.kind }).from(mapTitleRules).where(eq(mapTitleRules.id, input.ruleId)).get()]);
      if (!map) throw new Error("MAP_NOT_FOUND");
      if (!rule) throw new Error("MAP_TITLE_RULE_NOT_FOUND");
      const startsAt = input.startsAt ?? null;
      const endsAt = input.endsAt ?? null;
      if (rule.kind.trim().toLocaleLowerCase() === "pioneer" && input.enabled && (startsAt === null || endsAt === null || endsAt <= startsAt)) throw new Error("PIONEER_EXCEPTION_SCHEDULE_REQUIRED");
      const timestamp = now();
      const operation = "admin.map-title-rule-exception.upsert";
      const requestHash = await hashRequest(input);
      await database.batch([
        database.prepare("INSERT INTO map_title_rule_exceptions (id,rule_id,map_id,enabled,condition,evidence_rule,submission_mode,slot,starts_at,ends_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(rule_id,map_id) DO UPDATE SET enabled=excluded.enabled, condition=excluded.condition, evidence_rule=excluded.evidence_rule, submission_mode=excluded.submission_mode, slot=excluded.slot, starts_at=excluded.starts_at, ends_at=excluded.ends_at, updated_at=excluded.updated_at")
          .bind(crypto.randomUUID(), input.ruleId, input.mapId, input.enabled ? 1 : 0, input.condition ?? null, input.evidenceRule ?? null, input.submissionMode ?? null, input.slot ?? null, startsAt, endsAt, timestamp, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)")
          .bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, requestHash, JSON.stringify({}), timestamp),
        database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "map_title_rule_exception", `${input.ruleId}:${input.mapId}`, JSON.stringify(input), timestamp),
      ]);
    },

    async updateAdminChallenge(input, auth, idempotencyKey) {
      if (input.family === "achievement") return updateTitleChallenge(input, auth, idempotencyKey);
      const replay = await replayOrConflict<AdminChallenge>(db, auth.subject, "admin.achievement.update", idempotencyKey, input); if (replay) return replay;
      const timestamp = now();
      if (input.family === "map") {
        const row = await db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(eq(achievementChallenges.id, input.challengeId)).get();
        if (!row) throw new Error("CHALLENGE_NOT_FOUND");
        const projection = await db.select({ gameplayRevisionId: gameplayRevisions.id })
          .from(gameplayRevisionChallengeAssignments)
          .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
          .where(and(
            eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_challenge"),
            eq(gameplayRevisionChallengeAssignments.challengeId, row.challenge.id),
            eq(gameplayRevisionChallengeAssignments.mapId, row.map.id),
            eq(gameplayRevisionChallengeAssignments.enabled, 1),
            eq(gameplayRevisions.mapId, row.map.id),
            inArray(gameplayRevisions.lifecycle, ["default", "selectable", "historical"]),
          ))
          .orderBy(gameplayRevisions.lifecycle, gameplayRevisions.id)
          .get();
        if (!projection) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
        const name = input.name ?? row.challenge.name;
        const difficulty = input.difficulty !== undefined ? input.difficulty : row.challenge.difficulty;
        const condition = input.condition ?? row.challenge.condition;
        const evidenceRule = input.evidenceRule ?? row.challenge.evidenceRule;
        const submissionMode = input.submissionMode ?? row.challenge.submissionMode;
        await db.update(achievementChallenges).set({ name, difficulty, condition, evidenceRule, submissionMode, status: input.status, retiredVersion: input.status === "active" ? input.retiredVersion ?? null : null, updatedAt: timestamp }).where(eq(achievementChallenges.id, row.challenge.id));
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "map", gameplayRevisionId: projection.gameplayRevisionId, type: "map_completion", kind: row.challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name, mapId: row.map.id, mapName: row.map.name, difficulty: difficulty ?? undefined, condition, evidenceRule, submissionMode: submissionMode as "manual" | "automatic", gameVersion: row.challenge.gameVersion, status: input.status, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "active" ? input.retiredVersion ?? null : null };
        await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
        await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
        return response;
      }
      throw new Error("CHALLENGE_NOT_FOUND");
    },

    async uploadAdminTitleIcon(input, auth) {
      if (!evidenceBucket) throw new Error("ICON_BUCKET_UNAVAILABLE");
      const extension = titleIconContentTypes.get(input.contentType);
      if (!extension || input.body.byteLength === 0 || input.body.byteLength > maxTitleIconBytes) throw new Error("ICON_FILE_INVALID");
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title) throw new Error("TITLE_NOT_FOUND");
      const version = crypto.randomUUID();
      const objectKey = `public/achievement-icons/${encodeURIComponent(input.titleKey)}/${version}.${extension}`;
      await evidenceBucket.put(objectKey, input.body, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=31536000, immutable" } });
      const iconUrl = `${uploadOrigin}/v1/public/achievement-icons/${encodeURIComponent(input.titleKey)}/${version}`;
      await db.update(titleCatalog).set({ iconUrl, iconObjectKey: objectKey }).where(eq(titleCatalog.key, input.titleKey));
      if (title.iconObjectKey) await evidenceBucket.delete(title.iconObjectKey);
      await recordAudit(db, auth, "admin.title.icon.upload", "title_catalog", input.titleKey, { contentType: input.contentType, byteSize: input.body.byteLength });
      return { iconUrl };
    },

    async getPublicTitleIcon(input) {
      if (!evidenceBucket) return null;
      const title = await db.select({ objectKey: titleCatalog.iconObjectKey, lifecycle: titleCatalog.lifecycle, publicVisibility: titleCatalog.publicVisibility }).from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title?.objectKey || title.lifecycle === "draft" || title.publicVisibility !== 1) return null;
      if (input.version !== undefined && titleIconVersionOf(title.objectKey) !== input.version) return null;
      const object = await evidenceBucket.get(title.objectKey);
      if (!object) return null;
      return { body: object.body, contentType: object.httpMetadata?.contentType ?? "application/octet-stream", etag: object.httpEtag };
    }
  };
};
