import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { deriveTitleAvailability, parseChallengeProgressRule, publicTitleChallengeStatus } from "@owbastion/domain";
import type { AuthContext, ChallengeProgressRule, PlatformServices } from "@owbastion/domain";
import type { AdminChallengeUpdateRequest, AdminTitleChallenge, AdminTitleSummary, AdminTitleCascade, AdminCatalogTitleUpdateResponse, AdminChallengeLifecycleResponse } from "@owbastion/contracts";
import { hashRequest } from "./portal-session";
import { achievementChallengeMaps, mapTitleRules, titleCatalog, titleChallenges } from "./schema";
import type { createChallengeCatalogServices } from "./challenge-catalog-service";

type Title = typeof titleCatalog.$inferSelect;
type TitleChallenge = typeof titleChallenges.$inferSelect;
type Rule = typeof mapTitleRules.$inferSelect;
type Dependencies = {
  database: D1Database;
  evidenceBucket?: R2Bucket;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  replayOrConflict: <T>(db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  latestBuildVersion: () => Promise<string>;
  assertProgressRuleTargets: (rule: ChallengeProgressRule) => Promise<void>;
  reconcileProgressChallengePlayers: (input: { challenge: TitleChallenge; rule: ChallengeProgressRule; actorId: string }) => Promise<void>;
  challengeCatalog: Pick<ReturnType<typeof createChallengeCatalogServices>, "loadTitleChallengeRevisions" | "validateChallengeMapScope" | "toTitleChallengeBase">;
};
type Services = Pick<PlatformServices, "listAdminTitleSummaries" | "createAdminTitle" | "listAdminTitleChallenges" | "createAdminTitleChallenge" | "updateAdminChallengeLifecycle" | "updateAdminCatalogTitle">;

export const createAdminTitleServices = ({ database, evidenceBucket, db, now, replayOrConflict, latestBuildVersion, assertProgressRuleTargets, reconcileProgressChallengePlayers, challengeCatalog }: Dependencies): Services & {
  updateTitleChallenge: (input: Extract<AdminChallengeUpdateRequest, { family: "achievement" }> & { challengeId: string }, auth: AuthContext, key: string) => Promise<AdminTitleChallenge & { contractVersion: "1" }>;
} => {
  const loadTitle = async (key: string) => {
    const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, key)).get();
    if (!title) throw new Error("TITLE_NOT_FOUND");
    return title;
  };
  const loadChallenge = async (id: string) => {
    const row = await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, id)).get();
    if (!row) throw new Error("CHALLENGE_NOT_FOUND");
    return row;
  };
  const mapIdsFor = async (id: string) => (await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, id))).map(row => row.mapId);
  const challengeView = (challenge: TitleChallenge, title: Title, mapIds: string[]): AdminTitleChallenge => ({
    ...challengeCatalog.toTitleChallengeBase(challenge, title),
    categoryOverride: challenge.categoryOverride, gameVersion: challenge.gameVersion,
    status: challenge.status as AdminTitleChallenge["status"], introducedVersion: challenge.introducedVersion,
    retiredVersion: challenge.retiredVersion, startsAt: challenge.startsAt, endsAt: challenge.endsAt,
    scope: title.scope as "global" | "map", mapIds, replacedByChallengeId: challenge.replacedByChallengeId,
    ...(challenge.mapVariant ? { mapVariant: challenge.mapVariant as "classic" } : {}),
    ...(parseChallengeProgressRule(challenge.progressRule) ? { progressRule: parseChallengeProgressRule(challenge.progressRule)! } : {}),
  });
  const summary = (title: Title, challenges: TitleChallenge[], rule?: Rule): AdminTitleSummary => {
    const paths = challenges.map(challenge => ({ ...challenge, gameVersion: title.gameVersion ? challenge.gameVersion : null }));
    return {
      titleKey: title.key, label: title.label, icon: title.icon, iconUrl: title.iconUrl, category: title.category,
      scope: title.scope as "global" | "map", displayKind: title.displayKind as AdminTitleSummary["displayKind"],
      color: JSON.parse(title.colorJson), publicVisibility: title.publicVisibility === 1,
      lifecycle: title.lifecycle as AdminTitleSummary["lifecycle"], gameVersion: title.gameVersion,
      developerOnly: title.category === "开发保留",
      status: title.lifecycle === "draft" ? "draft" : title.lifecycle === "retired" ? "retired" : rule?.status === "active" ? "active" : deriveTitleAvailability(paths, now()),
      acquisition: rule ? { kind: "map_rule", ruleId: rule.id, condition: rule.condition, scopeLabel: rule.defaultScope === "all_active" ? `适用于所有地图的${rule.mapVariant === "classic" ? "经典" : "默认"}版本` : "适用于指定地图版本" }
        : challenges.length ? { kind: "challenges", challengeCount: challenges.length, completableCount: title.lifecycle !== "active" ? 0 : paths.filter(path => {
          const status = publicTitleChallengeStatus(path.status, path.startsAt, path.endsAt, now(), path.gameVersion, path.retiredVersion);
          return status === "active" || status === "sunsetting";
        }).length } : { kind: "none" },
    };
  };
  const titleSummary = async (title: Title, challengeRows?: TitleChallenge[], ruleRows?: Rule[]) => summary(title,
    challengeRows ?? await db.select().from(titleChallenges).where(eq(titleChallenges.titleKey, title.key)),
    (ruleRows ?? await db.select().from(mapTitleRules).where(eq(mapTitleRules.titleKey, title.key)))[0]);
  const mutationRecords = async (operation: string, input: unknown, response: unknown, auth: AuthContext, key: string, entityType: string, entityId: string, payload: unknown = input): Promise<D1PreparedStatement[]>  => [
    database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)").bind(`${auth.subject}:${operation}:${key}`, auth.subject, operation, await hashRequest(input), JSON.stringify(response), now()),
    database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, entityType, entityId, JSON.stringify(payload), now()),
  ];
  const reconcile = async (id: string, auth: AuthContext) => {
    const { challenge, title } = await loadChallenge(id);
    const rule = parseChallengeProgressRule(challenge.progressRule);
    if (rule && challenge.status === "active" && title.lifecycle === "active") await reconcileProgressChallengePlayers({ challenge, rule, actorId: auth.subject });
  };
  const validate = async (title: Title, challenge: TitleChallenge, mapIds: string[], mapFieldsPresent: boolean, validateProgress = true) => {
    if (title.scope !== "map" && mapFieldsPresent) throw new Error("INVALID_MAP_SCOPE");
    await challengeCatalog.validateChallengeMapScope(title.scope as "global" | "map", mapIds);
    if (challenge.startsAt !== null && challenge.endsAt !== null && challenge.endsAt <= challenge.startsAt) throw new Error("INVALID_CHALLENGE_WINDOW");
    const rule = parseChallengeProgressRule(challenge.progressRule);
    if (rule) {
      if (title.scope !== "global") throw new Error("INVALID_MAP_SCOPE");
      if (challenge.submissionMode !== "manual") throw new Error("INVALID_SUBMISSION_MODE");
      if (validateProgress) await assertProgressRuleTargets(rule);
    }
    if (challenge.status !== "draft" && !challenge.gameVersion?.trim()) throw new Error("ACHIEVEMENT_GAME_VERSION_REQUIRED");
  };
  const writeChallenge = (row: TitleChallenge, insert: boolean) => insert
    ? database.prepare("INSERT INTO title_challenges (id,title_key,category_override,condition,evidence_rule,submission_mode,game_version,status,introduced_version,retired_version,starts_at,ends_at,scope,map_variant,progress_rule,replaced_by_challenge_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(row.id, row.titleKey, row.categoryOverride, row.condition, row.evidenceRule, row.submissionMode, row.gameVersion, row.status, row.introducedVersion, row.retiredVersion, row.startsAt, row.endsAt, row.scope, row.mapVariant, row.progressRule, row.replacedByChallengeId, row.createdAt, row.updatedAt)
    : database.prepare("UPDATE title_challenges SET condition=?,evidence_rule=?,submission_mode=?,category_override=?,game_version=?,status=?,introduced_version=?,retired_version=?,starts_at=?,ends_at=?,updated_at=? WHERE id=?").bind(row.condition, row.evidenceRule, row.submissionMode, row.categoryOverride, row.gameVersion, row.status, row.introducedVersion, row.retiredVersion, row.startsAt, row.endsAt, row.updatedAt, row.id);
  const mapStatements = async (row: TitleChallenge, mapIds: string[]) => {
    const revisions = row.scope === "map" ? await challengeCatalog.loadTitleChallengeRevisions(mapIds, row.mapVariant as "classic" | null) : [];
    return [
      ...mapIds.map(mapId => database.prepare("INSERT INTO achievement_challenge_maps (challenge_id,map_id) VALUES (?,?)").bind(row.id, mapId)),
      ...revisions.map(({ revision }) => database.prepare("INSERT INTO gameplay_revision_challenge_assignments (id,gameplay_revision_id,map_id,challenge_family,challenge_id,enabled,created_at,updated_at) VALUES (?,?,?,'title_challenge',?,1,?,?)").bind(`assignment:${revision.id}:title_challenge:${row.id}`, revision.id, revision.mapId, row.id, row.createdAt, row.updatedAt)),
    ];
  };
  const previousState = (row: TitleChallenge) => ({ status: row.status as AdminTitleChallenge["status"], retiredVersion: row.retiredVersion, startsAt: row.startsAt, endsAt: row.endsAt });
  const assertWritableTitle = async (title: Title) => {
    if (title.lifecycle === "retired") throw new Error("TITLE_RETIRED");
    if (await db.select({ id: mapTitleRules.id }).from(mapTitleRules).where(eq(mapTitleRules.titleKey, title.key)).get()) throw new Error("TITLE_MANAGED_BY_MAP_RULE");
  };
  return {
    async listAdminTitleSummaries() {
      // Bounded bulk reads: no per-title queries, including titles with no paths.
      const [titles, challenges, rules] = await Promise.all([db.select().from(titleCatalog).orderBy(titleCatalog.category, titleCatalog.label), db.select().from(titleChallenges), db.select().from(mapTitleRules)]);
      const byTitle = new Map<string, TitleChallenge[]>();
      for (const challenge of challenges) byTitle.set(challenge.titleKey, [...(byTitle.get(challenge.titleKey) ?? []), challenge]);
      const ruleByTitle = new Map(rules.map(rule => [rule.titleKey, rule]));
      return { contractVersion: "1", items: titles.map(title => summary(title, byTitle.get(title.key) ?? [], ruleByTitle.get(title.key))) };
    },
    async createAdminTitle(input, auth, key) {
      const operation = "admin.title.create";
      const replay = await replayOrConflict<AdminTitleSummary & { contractVersion: "1" }>(db, auth.subject, operation, key, input);
      if (replay) return replay;
      const titleKey = input.titleKey ?? `TITLE_${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
      if (await db.select({ key: titleCatalog.key }).from(titleCatalog).where(eq(titleCatalog.key, titleKey)).get()) throw new Error("TITLE_KEY_CONFLICT");
      const title: Title = { key: titleKey, label: input.label, icon: input.icon, iconUrl: input.iconUrl ?? null, iconObjectKey: null, category: input.category, condition: "", lifecycle: "draft", publicVisibility: input.publicVisibility ? 1 : 0, scope: input.scope, displayKind: input.displayKind, colorJson: JSON.stringify(input.color ?? null), gameVersion: input.gameVersion ?? null };
      const response = { contractVersion: "1" as const, ...summary(title, []) };
      try {
        await database.batch([
          database.prepare("INSERT INTO title_catalog (key,label,icon,icon_url,category,condition,lifecycle,public_visibility,scope,display_kind,color_json,game_version) VALUES (?,?,?,?,?,?,'draft',?,?,?,?,?)").bind(title.key, title.label, title.icon, title.iconUrl, title.category, title.condition, title.publicVisibility, title.scope, title.displayKind, title.colorJson, title.gameVersion),
          ...await mutationRecords(operation, input, response, auth, key, "title_catalog", title.key),
        ]);
      } catch (error) {
        if (String(error).includes("UNIQUE constraint failed: title_catalog.key")) throw new Error("TITLE_KEY_CONFLICT");
        throw error;
      }
      return response;
    },
    async listAdminTitleChallenges({ titleKey }) {
      const title = await loadTitle(titleKey);
      const [rows, links] = await Promise.all([db.select().from(titleChallenges).where(eq(titleChallenges.titleKey, titleKey)), db.select().from(achievementChallengeMaps)]);
      const maps = new Map<string, string[]>();
      for (const link of links) maps.set(link.challengeId, [...(maps.get(link.challengeId) ?? []), link.mapId]);
      rows.sort((a, b) => Number(a.status === "archived") - Number(b.status === "archived") || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
      return { contractVersion: "1", items: rows.map(row => challengeView(row, title, maps.get(row.id) ?? [])) };
    },
    async createAdminTitleChallenge(input, auth, key) {
      const operation = "admin.title.challenge.create";
      const replay = await replayOrConflict<AdminTitleChallenge & { contractVersion: "1" }>(db, auth.subject, operation, key, input);
      if (replay) { await reconcile(replay.challengeId, auth); return replay; }
      const title = await loadTitle(input.titleKey);
      await assertWritableTitle(title);
      const gameVersion = input.gameVersion?.trim() || (input.status === "active" ? await latestBuildVersion() : null);
      const row: TitleChallenge = { id: `title.${title.key}.${crypto.randomUUID()}`, titleKey: title.key, categoryOverride: null, condition: input.condition, evidenceRule: input.evidenceRule ?? "上传包含结算画面、称号条件与玩家信息的完整截图。", submissionMode: input.submissionMode, gameVersion, introducedVersion: gameVersion, status: input.status, retiredVersion: null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, scope: title.scope, mapVariant: input.mapVariant ?? null, progressRule: input.progressRule ? JSON.stringify(input.progressRule) : null, replacedByChallengeId: null, createdAt: now(), updatedAt: now() };
      const mapIds = [...new Set(input.mapIds ?? [])];
      await validate(title, row, mapIds, input.mapIds !== undefined || input.mapVariant !== undefined);
      const nextTitle = { ...title, gameVersion: title.gameVersion ?? gameVersion, lifecycle: input.enableTitle && input.status === "active" && title.lifecycle === "draft" ? "active" : title.lifecycle };
      const response = { contractVersion: "1" as const, ...challengeView(row, nextTitle, mapIds) };
      await database.batch([
        writeChallenge(row, true), ...await mapStatements(row, mapIds),
        database.prepare("UPDATE title_catalog SET lifecycle=?,game_version=? WHERE key=?").bind(nextTitle.lifecycle, nextTitle.gameVersion, title.key),
        ...await mutationRecords(operation, input, response, auth, key, "challenge", row.id),
      ]);
      await reconcile(row.id, auth);
      return response;
    },
    async updateTitleChallenge(input, auth, key) {
      const operation = "admin.achievement.update";
      const replay = await replayOrConflict<AdminTitleChallenge & { contractVersion: "1" }>(db, auth.subject, operation, key, input);
      if (replay) { await reconcile(replay.challengeId, auth); return replay; }
      const { challenge: old, title } = await loadChallenge(input.challengeId);
      const oldMapIds = await mapIdsFor(old.id);
      const mapIds = input.mapIds === undefined ? oldMapIds : [...new Set(input.mapIds)];
      const progressRule = input.progressRule === undefined ? parseChallengeProgressRule(old.progressRule) : input.progressRule === null ? null : parseChallengeProgressRule(JSON.stringify(input.progressRule));
      const mapVariant = input.mapVariant === undefined ? old.mapVariant : input.mapVariant;
      const normalizeRule = (rule: ChallengeProgressRule | null) => rule ? { type: rule.type, mapIds: rule.mapIds ? [...new Set(rule.mapIds)].sort() : undefined, mode: rule.mode, difficultyAtLeast: rule.difficultyAtLeast } : null;
      const qualificationChanged = JSON.stringify(normalizeRule(progressRule)) !== JSON.stringify(normalizeRule(parseChallengeProgressRule(old.progressRule))) || JSON.stringify([...mapIds].sort()) !== JSON.stringify([...oldMapIds].sort()) || mapVariant !== old.mapVariant;
      if (qualificationChanged && input.saveMode === "in_place") throw new Error("CHALLENGE_QUALIFICATION_CHANGED");
      const replacing = input.saveMode === "new_challenge";
      if (replacing) await assertWritableTitle(title);
      const gameVersion = input.gameVersion === undefined ? old.gameVersion : input.gameVersion;
      if (input.gameVersion === null && (old.gameVersion !== null || old.introducedVersion !== null)) throw new Error("ACHIEVEMENT_GAME_VERSION_REQUIRED");
      const row: TitleChallenge = { ...old, id: replacing ? `title.${title.key}.${crypto.randomUUID()}` : old.id, condition: input.condition, evidenceRule: input.evidenceRule, submissionMode: input.submissionMode, categoryOverride: input.categoryOverride, status: input.status, retiredVersion: input.status === "active" ? input.retiredVersion ?? null : null, startsAt: input.status === "archived" ? null : input.startsAt ?? null, endsAt: input.status === "archived" ? null : input.endsAt ?? null, scope: title.scope, mapVariant, progressRule: progressRule ? JSON.stringify(progressRule) : null, gameVersion, introducedVersion: replacing ? gameVersion : old.introducedVersion ?? gameVersion, replacedByChallengeId: replacing ? null : old.replacedByChallengeId, createdAt: replacing ? now() : old.createdAt, updatedAt: now() };
      await validate(title, row, mapIds, title.scope !== "map" && (input.mapIds !== undefined || input.mapVariant !== undefined), qualificationChanged);
      const nextTitle = { ...title, gameVersion: title.gameVersion ?? gameVersion, iconUrl: input.iconUrl === undefined ? title.iconUrl : input.iconUrl };
      const response = { contractVersion: "1" as const, ...challengeView(row, nextTitle, mapIds) };
      await database.batch([
        writeChallenge(row, replacing),
        ...(replacing ? [
          ...await mapStatements(row, mapIds),
          database.prepare("UPDATE title_challenges SET status='archived',retired_version=NULL,starts_at=NULL,ends_at=NULL,replaced_by_challenge_id=?,updated_at=? WHERE id=?").bind(row.id, now(), old.id),
        ] : []),
        database.prepare("UPDATE title_catalog SET game_version=?,icon_url=?,icon_object_key=? WHERE key=?").bind(nextTitle.gameVersion, nextTitle.iconUrl, nextTitle.iconUrl === title.iconUrl ? title.iconObjectKey : null, title.key),
        ...await mutationRecords(operation, input, response, auth, key, "challenge", row.id, { ...input, previousChallengeId: old.id, previous: previousState(old), replacementChallengeId: replacing ? row.id : null }),
      ]);
      if (input.iconUrl !== undefined && input.iconUrl !== title.iconUrl && title.iconObjectKey && evidenceBucket) await evidenceBucket.delete(title.iconObjectKey);
      // Never reconcile or invalidate the predecessor: its completions and grants are history.
      await reconcile(row.id, auth);
      return response;
    },
    async updateAdminChallengeLifecycle(input, auth, key) {
      const operation = "admin.challenge.lifecycle";
      const replay = await replayOrConflict<AdminChallengeLifecycleResponse>(db, auth.subject, operation, key, input);
      if (replay) { await reconcile(replay.challenge.challengeId, auth); return replay; }
      const { challenge: old, title } = await loadChallenge(input.challengeId);
      const row = { ...old, status: input.status, retiredVersion: input.retiredVersion === undefined ? old.retiredVersion : input.retiredVersion, startsAt: input.startsAt === undefined ? old.startsAt : input.startsAt, endsAt: input.endsAt === undefined ? old.endsAt : input.endsAt, gameVersion: old.gameVersion ?? (input.status === "active" ? await latestBuildVersion() : null), updatedAt: now() };
      row.introducedVersion ??= row.gameVersion;
      if (row.startsAt !== null && row.endsAt !== null && row.endsAt <= row.startsAt) throw new Error("INVALID_CHALLENGE_WINDOW");
      const nextTitle = { ...title, gameVersion: title.gameVersion ?? row.gameVersion };
      const response: AdminChallengeLifecycleResponse = { contractVersion: "1", challenge: challengeView(row, nextTitle, await mapIdsFor(row.id)), previous: previousState(old) };
      await database.batch([
        writeChallenge(row, false),
        database.prepare("UPDATE title_catalog SET game_version=? WHERE key=?").bind(nextTitle.gameVersion, title.key),
        ...await mutationRecords(operation, input, response, auth, key, "challenge", row.id, { ...input, previous: response.previous }),
      ]);
      await reconcile(row.id, auth);
      return response;
    },
    async updateAdminCatalogTitle(input, auth, key) {
      const operation = "admin.title.catalog.update";
      const replay = await replayOrConflict<AdminCatalogTitleUpdateResponse>(db, auth.subject, operation, key, input);
      if (replay) return replay;
      const title = await loadTitle(input.titleKey);
      const lifecycle = input.lifecycle ?? title.lifecycle;
      if (input.restore && !(title.lifecycle === "retired" && lifecycle === "active")) throw new Error("INVALID_RESTORE");
      const [rows, rules] = await Promise.all([db.select().from(titleChallenges).where(eq(titleChallenges.titleKey, title.key)), db.select().from(mapTitleRules).where(eq(mapTitleRules.titleKey, title.key))]);
      // Challenge/map assignments key off the title's scope at creation. A
      // stored acquisition path would silently mean the new scope, so the
      // scope is immutable once acquisition rows exist.
      if (input.scope !== undefined && input.scope !== title.scope && (rows.length || rules.length)) throw new Error("TITLE_SCOPE_LOCKED");
      if (input.restore) {
        if (new Set(input.restore.challenges.map(row => row.challengeId)).size !== input.restore.challenges.length || new Set(input.restore.mapTitleRules.map(row => row.ruleId)).size !== input.restore.mapTitleRules.length) throw new Error("INVALID_RESTORE");
        for (const row of input.restore.challenges) if (!rows.some(stored => stored.id === row.challengeId) || (row.startsAt !== null && row.endsAt !== null && row.endsAt <= row.startsAt)) throw new Error("INVALID_RESTORE");
        for (const rule of input.restore.mapTitleRules) if (!rules.some(stored => stored.id === rule.ruleId)) throw new Error("INVALID_RESTORE");
      }
      const retiring = lifecycle === "retired" && title.lifecycle !== "retired";
      const cascaded: AdminTitleCascade = { challenges: retiring ? rows.filter(row => row.status !== "archived").map(row => ({ challengeId: row.id, ...previousState(row) })) : [], mapTitleRules: retiring ? rules.filter(rule => rule.status !== "archived").map(rule => ({ ruleId: rule.id, status: rule.status as "draft" | "active", retiredVersion: rule.retiredVersion })) : [] };
      const next = { ...title, lifecycle, publicVisibility: input.publicVisibility === undefined ? title.publicVisibility : Number(input.publicVisibility), label: input.label ?? title.label, icon: input.icon ?? title.icon, iconUrl: input.iconUrl === undefined ? title.iconUrl : input.iconUrl, iconObjectKey: input.iconUrl === undefined || input.iconUrl === title.iconUrl ? title.iconObjectKey : null, category: input.category ?? title.category, scope: input.scope ?? title.scope, displayKind: input.displayKind ?? title.displayKind, colorJson: input.color === undefined ? title.colorJson : JSON.stringify(input.color) };
      const nextRows = rows.map(row => retiring && row.status !== "archived" ? { ...row, status: "archived", retiredVersion: null, startsAt: null, endsAt: null } : { ...row, ...input.restore?.challenges.find(state => state.challengeId === row.id) });
      const nextRules = rules.map(rule => retiring && rule.status !== "archived" ? { ...rule, status: "archived", retiredVersion: null } : { ...rule, ...input.restore?.mapTitleRules.find(state => state.ruleId === rule.id) });
      const response: AdminCatalogTitleUpdateResponse = { contractVersion: "1", title: await titleSummary(next, nextRows, nextRules), previousLifecycle: title.lifecycle as AdminTitleSummary["lifecycle"], cascaded };
      await database.batch([
        database.prepare("UPDATE title_catalog SET lifecycle=?,public_visibility=?,label=?,icon=?,icon_url=?,icon_object_key=?,category=?,scope=?,display_kind=?,color_json=? WHERE key=?").bind(next.lifecycle, next.publicVisibility, next.label, next.icon, next.iconUrl, next.iconObjectKey, next.category, next.scope, next.displayKind, next.colorJson, title.key),
        ...(retiring ? [database.prepare("UPDATE title_challenges SET status='archived',retired_version=NULL,starts_at=NULL,ends_at=NULL,updated_at=? WHERE title_key=? AND status!='archived'").bind(now(), title.key), database.prepare("UPDATE map_title_rules SET status='archived',retired_version=NULL,updated_at=? WHERE title_key=? AND status!='archived'").bind(now(), title.key)] : []),
        ...(input.restore?.challenges ?? []).map(row => database.prepare("UPDATE title_challenges SET status=?,retired_version=?,starts_at=?,ends_at=?,updated_at=? WHERE id=? AND title_key=?").bind(row.status, row.retiredVersion, row.startsAt, row.endsAt, now(), row.challengeId, title.key)),
        ...(input.restore?.mapTitleRules ?? []).map(rule => database.prepare("UPDATE map_title_rules SET status=?,retired_version=?,updated_at=? WHERE id=? AND title_key=?").bind(rule.status, rule.retiredVersion, now(), rule.ruleId, title.key)),
        ...await mutationRecords(operation, input, response, auth, key, "title_catalog", title.key, { ...input, previousLifecycle: title.lifecycle, cascaded, previousPublicVisibility: title.publicVisibility === 1 }),
      ]);
      if (title.iconObjectKey && next.iconObjectKey !== title.iconObjectKey && evidenceBucket) await evidenceBucket.delete(title.iconObjectKey);
      if (lifecycle === "active") for (const row of nextRows) if (row.progressRule && row.status === "active") await reconcile(row.id, auth);
      return response;
    },
  };
};
