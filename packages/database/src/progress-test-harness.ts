import { DatabaseSync } from "node:sqlite";
import { mapTitleRulesSchema } from "../test/schema";
import type { AdminTitleChallengeCreateRequest } from "@owbastion/contracts";
import type { AuthContext, VerifiedRunInput } from "@owbastion/domain";
import { createPlatformServices } from "./index";
export type ProgressFixtureInput = AdminTitleChallengeCreateRequest & { titleKey: string; titleName: string; icon: string; category: string; scope: "global" | "map"; mapIds: string[]; categoryOverride: null; iconUrl: null };

export const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  let pendingBatch: Promise<void> = Promise.resolve();
  let statementCount = 0;
  let progressResultRows = 0;
  let readStatements: Array<{ sql: string; parameters: unknown[] }> = [];
  const countRows = (statementSql: string, rows: number) => {
    if (statementSql.includes("mastery_runs")) progressResultRows += rows;
  };
  const wrapStatement = (statementSql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() {
        readStatements.push({ sql: statementSql, parameters: [...bound] });
        const result = (sqlite.prepare(statementSql).get(...bound) as T | undefined) ?? null;
        countRows(statementSql, result ? 1 : 0);
        return result;
      },
      async all<T>() {
        readStatements.push({ sql: statementSql, parameters: [...bound] });
        const results = sqlite.prepare(statementSql).all(...bound) as T[];
        countRows(statementSql, results.length);
        return { results, success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: results.length, rows_written: 0, last_row_id: 0, changed_db: false } };
      },
      async run() {
        const info = sqlite.prepare(statementSql).run(...bound);
        return { success: true, meta: { changes: Number(info.changes ?? 0), duration: 0, size_after: 0, rows_read: 0, rows_written: Number(info.rows_written ?? info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0), changed_db: true } };
      },
      async raw<T extends unknown[] = unknown[]>() {
        readStatements.push({ sql: statementSql, parameters: [...bound] });
        const prepared = sqlite.prepare(statementSql);
        prepared.setReturnArrays(true);
        const results = prepared.all(...bound) as T[];
        countRows(statementSql, results.length);
        return results;
      },
    };
    return statement;
  };
  const database = {
    prepare(statementSql: string) { statementCount += 1; return wrapStatement(statementSql); },
    batch(statements: Array<ReturnType<typeof wrapStatement>>) {
      const apply = async () => {
        sqlite.exec("BEGIN;");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          sqlite.exec("COMMIT;");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK;");
          throw error;
        }
      };
      const batch = pendingBatch.then(apply, apply);
      pendingBatch = batch.then(() => undefined, () => undefined);
      return batch;
    },
    async exec(statementSql: string) { sqlite.exec(statementSql); return []; },
    withSession() { return database; },
  } as unknown as D1Database;
  return {
    database, sqlite,
    resetQueryMetrics: () => { statementCount = 0; progressResultRows = 0; readStatements = []; },
    queryMetrics: () => ({ statementCount, progressResultRows }),
    capturedReadStatements: () => readStatements,
  };
};

export const hashRequest = async (value: unknown) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  ${mapTitleRulesSchema}
  CREATE TABLE player_accounts (id TEXT PRIMARY KEY NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', public_profile INTEGER NOT NULL DEFAULT 1, hide_battletag INTEGER NOT NULL DEFAULT 0, banned_at INTEGER, banned_by TEXT, ban_reason TEXT, leaderboard_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE maps (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL, introduced_version TEXT NOT NULL, retired_version TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE map_metadata (map_id TEXT PRIMARY KEY NOT NULL REFERENCES maps(id), difficulty_rating TEXT, mechanics_json TEXT NOT NULL DEFAULT '[]', cover_url TEXT, background_url TEXT, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL);
  CREATE TABLE random_event_versions (game_version TEXT PRIMARY KEY NOT NULL, availability TEXT NOT NULL DEFAULT 'available', mode TEXT, suspended_at INTEGER, suspended_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE standalone_modes (mode TEXT PRIMARY KEY NOT NULL, event_weight_total REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE gameplay_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    map_id TEXT NOT NULL REFERENCES maps(id),
    lifecycle TEXT NOT NULL,
    legacy_map_variant TEXT,
    mode TEXT,
    copied_from_revision_id TEXT,
    reset_reason TEXT,
    game_version TEXT NOT NULL,
    spatial_config_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE bindings (id TEXT PRIMARY KEY NOT NULL, identity_id TEXT NOT NULL, player_account_id TEXT NOT NULL REFERENCES player_accounts(id), provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, status TEXT NOT NULL, revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE portal_sessions (id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE submissions (
    id TEXT PRIMARY KEY NOT NULL,
    player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    binding_id TEXT REFERENCES bindings(id),
    status TEXT NOT NULL DEFAULT 'approved',
    challenge_type TEXT NOT NULL DEFAULT 'map_completion',
    challenge_id TEXT,
    target_map_id TEXT,
    gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
    map_name TEXT NOT NULL DEFAULT 'Test',
    difficulty TEXT,
    player_name TEXT,
    review_reason TEXT,
    grant_id TEXT,
    ocr_fail_count INTEGER NOT NULL DEFAULT 0,
    rule_snapshot_json TEXT,
    source_provider TEXT NOT NULL DEFAULT 'qq',
    source_conversation_id TEXT NOT NULL DEFAULT 'conversation',
    source_message_id TEXT NOT NULL DEFAULT 'message',
    created_at INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE challenges (
    id TEXT PRIMARY KEY NOT NULL,
    source_family TEXT NOT NULL CHECK (source_family IN ('title_challenge', 'map_title_rule', 'map_challenge', 'manual')),
    source_id TEXT NOT NULL,
    title_key TEXT NOT NULL REFERENCES title_catalog(key),
    rule_version TEXT NOT NULL DEFAULT 'legacy',
    map_id TEXT REFERENCES maps(id),
    gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    manual INTEGER NOT NULL DEFAULT 0,
    public_condition INTEGER NOT NULL DEFAULT 1,
    condition_operator TEXT NOT NULL DEFAULT 'and',
    conditions_json TEXT NOT NULL DEFAULT '[]',
    condition TEXT NOT NULL,
    starts_at INTEGER,
    ends_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX challenges_source_scope_idx ON challenges(source_family, source_id, rule_version, COALESCE(map_id, ''), COALESCE(gameplay_revision_id, ''));
  CREATE TABLE challenge_completions (
    id TEXT PRIMARY KEY NOT NULL,
    player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    challenge_id TEXT NOT NULL REFERENCES challenges(id),
    gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalidated')),
    source_type TEXT NOT NULL CHECK (source_type IN ('submission', 'manual', 'challenge_satisfies', 'migration', 'verified_run_progress')),
    source_id TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    invalidated_by TEXT,
    invalidated_at INTEGER,
    invalidation_reason TEXT,
    created_at INTEGER NOT NULL,
    CHECK (status <> 'invalidated' OR invalidated_at IS NOT NULL)
  );
  CREATE UNIQUE INDEX challenge_completions_player_challenge_idx ON challenge_completions(player_account_id, challenge_id, COALESCE(gameplay_revision_id, '')) WHERE status = 'active';
  CREATE UNIQUE INDEX challenge_completions_source_idx ON challenge_completions(source_type, source_id, challenge_id);
  CREATE TABLE player_title_grants (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL, title_key TEXT NOT NULL, map_id TEXT,
    gameplay_revision_id TEXT, slot TEXT, status TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
    granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_by TEXT, revoked_at INTEGER, revoke_reason TEXT,
    completion_id TEXT, revocation_type TEXT
  );
  CREATE UNIQUE INDEX player_title_grants_source_idx ON player_title_grants(source_type, source_id, title_key);
  CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, ''), COALESCE(gameplay_revision_id, '')) WHERE status = 'active';
  CREATE UNIQUE INDEX player_title_grants_completion_idx ON player_title_grants(completion_id) WHERE completion_id IS NOT NULL;
  CREATE TABLE mastery_runs (
    id TEXT PRIMARY KEY NOT NULL,
    player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    source_submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
    map_id TEXT NOT NULL REFERENCES maps(id),
    gameplay_revision_id TEXT NOT NULL REFERENCES gameplay_revisions(id),
    map_variant TEXT,
    difficulty TEXT NOT NULL,
    game_version TEXT NOT NULL,
    run_code TEXT NOT NULL,
    completion_duration_seconds INTEGER NOT NULL,
    deaths INTEGER,
    skips INTEGER,
    event_counters_json TEXT NOT NULL,
    acceptance_source TEXT NOT NULL,
    accepted_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    invalidated_at INTEGER,
    invalidated_by TEXT,
    invalidation_reason TEXT,
    xp_rule_version TEXT NOT NULL,
    xp_input_snapshot_json TEXT NOT NULL,
    awarded_xp INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX mastery_runs_active_player_map_version_run_code_idx ON mastery_runs(player_account_id, map_id, game_version, run_code) WHERE status = 'active';
  CREATE TABLE mastery_run_lifecycle_events (id TEXT PRIMARY KEY NOT NULL, mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id), transition TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE submission_outcomes (
    id TEXT PRIMARY KEY NOT NULL,
    submission_id TEXT NOT NULL REFERENCES submissions(id),
    outcome_key TEXT NOT NULL,
    outcome_type TEXT NOT NULL,
    status TEXT NOT NULL,
    entity_id TEXT,
    awarded_xp INTEGER NOT NULL DEFAULT 0,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (submission_id, outcome_key)
  );
  CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE audit_events (id TEXT PRIMARY KEY NOT NULL, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE title_catalog (key TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'award', icon_url TEXT, icon_object_key TEXT, category TEXT NOT NULL, condition TEXT NOT NULL, lifecycle TEXT NOT NULL DEFAULT 'active', public_visibility INTEGER NOT NULL DEFAULT 1, scope TEXT NOT NULL DEFAULT 'global', display_kind TEXT NOT NULL DEFAULT 'fixed', color_json TEXT NOT NULL DEFAULT 'null', game_version TEXT);
  CREATE TABLE title_challenges (id TEXT PRIMARY KEY NOT NULL, title_key TEXT NOT NULL, category_override TEXT, condition TEXT NOT NULL, evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, game_version TEXT, status TEXT NOT NULL, introduced_version TEXT, retired_version TEXT, starts_at INTEGER, ends_at INTEGER, scope TEXT NOT NULL DEFAULT 'global', map_variant TEXT, progress_rule TEXT, replaced_by_challenge_id TEXT REFERENCES title_challenges(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id));
  CREATE TABLE achievement_challenges (id TEXT PRIMARY KEY NOT NULL);
  CREATE TABLE mastery_run_conflict_resolutions (id TEXT PRIMARY KEY NOT NULL, mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id), conflict_submission_id TEXT NOT NULL REFERENCES submissions(id), action TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT, resolved_at INTEGER NOT NULL, UNIQUE (mastery_run_id, conflict_submission_id));
  CREATE TABLE ocr_results (manual INTEGER NOT NULL DEFAULT 0, callback_claimed INTEGER NOT NULL DEFAULT 0, id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, request_id TEXT, attempt INTEGER NOT NULL, status TEXT NOT NULL, response_json TEXT, match_json TEXT, error_code TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE ocr_accuracy_feedback (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, ocr_result_id TEXT NOT NULL, accuracy TEXT NOT NULL, marked_by TEXT NOT NULL, marked_by_type TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE submission_reviews (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT, reviewer TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE submission_spot_checks (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, status TEXT NOT NULL, policy_json TEXT NOT NULL, sampled_at INTEGER NOT NULL, resolved_at INTEGER, reviewer TEXT, reason TEXT);
`);

export const seed = (sqlite: DatabaseSync) => sqlite.exec(`
  INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES
    ('account-1', '1001', 'Alpha', 'alpha', 1, 1), ('account-2', '1002', 'Beta', 'beta', 1, 1);
  INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES
    ('map.alpha', 'Alpha', '26.0810.1', 'active', '26.0810.1', 1, 1),
    ('map.beta', 'Beta', '26.0810.1', 'active', '26.0810.1', 1, 1),
    ('map.gamma', 'Gamma', '26.0810.1', 'active', '26.0810.1', 1, 1),
    ('map.retired', 'Retired', '26.0810.1', 'retired', '26.0810.1', 1, 1);
  INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES
    ('revision:map.alpha', 'map.alpha', 'default', NULL, NULL, NULL, '26.0810.1', 1, 1),
    ('revision:map.beta', 'map.beta', 'default', NULL, NULL, NULL, '26.0810.1', 1, 1),
    ('revision:map.gamma', 'map.gamma', 'default', NULL, NULL, NULL, '26.0810.1', 1, 1);
  INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES
    ('binding-1', 'identity-1', 'account-1', 'qq', 'group-1', 'member-1', 'active', 1);
`);

export const admin: AuthContext = { actorType: "user", subject: "admin.1", roles: ["maintainer"], provider: "test" };

export const insertSubmission = (sqlite: DatabaseSync, id: string, playerAccountId: string, createdAt: number) =>
  sqlite.prepare("INSERT INTO submissions (id, player_account_id, binding_id, created_at, updated_at) VALUES (?, ?, 'binding-1', ?, ?)").run(id, playerAccountId, createdAt, createdAt);

export const achievementInput = (overrides: Partial<ProgressFixtureInput> = {}): ProgressFixtureInput => ({
  contractVersion: "1",
  titleKey: "ANNIVERSARY_TOUR",
  titleName: "到此一游",
  icon: "trophy",
  category: "周年系列",
  condition: "在活动期间完成全部指定地图",
  evidenceRule: "由已核实成绩自动判定",
  submissionMode: "manual",
  scope: "global",
  mapIds: [],
  status: "active",
  gameVersion: "26.0810.1",
  categoryOverride: null,
  iconUrl: null,
  progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] },
  ...overrides,
});

export const runInput = (overrides: Partial<VerifiedRunInput>): VerifiedRunInput => ({
  playerAccountId: "account-1",
  sourceSubmissionId: "submission-1",
  mapId: "map.alpha",
  gameplayRevisionId: "revision:map.alpha",
  mapVariant: null,
  difficulty: "困难",
  gameVersion: "26.0810.1",
  matchCode: "1234-5678-9012",
  completionDurationSeconds: 600,
  deaths: 2,
  skips: 1,
  eventCounters: {},
  acceptanceSource: "submission_review",
  acceptedAt: 1_000,
  ...overrides,
});

export const progressCompletion = (sqlite: DatabaseSync) =>
  sqlite.prepare("SELECT id, status, source_type, source_id, gameplay_revision_id, invalidation_reason FROM challenge_completions WHERE source_type = 'verified_run_progress'").all() as { id: string; status: string; source_type: string; source_id: string; gameplay_revision_id: string | null; invalidation_reason: string | null }[];

export const progressGrants = (sqlite: DatabaseSync) =>
  sqlite.prepare("SELECT id, player_account_id, status, source_type, source_id, granted_by, completion_id, revocation_type FROM player_title_grants WHERE granted_by = 'system:verified_run_progress' OR source_id IN (SELECT id FROM challenge_completions WHERE source_type = 'verified_run_progress')").all() as { id: string; player_account_id: string; status: string; source_type: string; source_id: string; granted_by: string; completion_id: string | null; revocation_type: string | null }[];

export const canonicalChallengeIds = (sqlite: DatabaseSync) =>
  (sqlite.prepare("SELECT id, rule_version, conditions_json FROM challenges WHERE source_family = 'title_challenge' AND title_key = 'ANNIVERSARY_TOUR'").all() as { id: string; rule_version: string; conditions_json: string }[]);

export const setup = () => {
  const harness = createD1();
  const { database, sqlite } = harness;
  installSchema(sqlite);
  seed(sqlite);
  const platform = createPlatformServices(database);
  // Existing run fixtures use the old combined input, but author through the two replacement boundaries.
  const services = { ...platform, createProgressChallenge: async (input: ProgressFixtureInput, auth: AuthContext, key: string) => {
    await platform.createAdminTitle({ contractVersion: "1", titleKey: input.titleKey, label: input.titleName, icon: input.icon, category: input.category, scope: input.scope, displayKind: "fixed", publicVisibility: true, gameVersion: input.gameVersion }, auth, "fixture.title");
    const response = await platform.createAdminTitleChallenge({ contractVersion: "1", titleKey: input.titleKey, condition: input.condition, evidenceRule: input.evidenceRule, submissionMode: input.submissionMode, status: input.status, gameVersion: input.gameVersion, startsAt: input.startsAt, endsAt: input.endsAt, progressRule: input.progressRule, ...(input.scope === "map" ? { mapIds: input.mapIds } : {}), enableTitle: true }, auth, key);
    return response;
  } };
  return { ...harness, services };
};

export const seedProgressReadRule = (sqlite: DatabaseSync, input: {
  id: string;
  rule?: AdminTitleChallengeCreateRequest["progressRule"];
  startsAt?: number;
  endsAt?: number;
  status?: string;
  visibility?: number;
  lifecycle?: string;
}) => {
  sqlite.prepare("INSERT INTO title_catalog (key,label,category,condition,public_visibility,lifecycle) VALUES (?, ?, 'read-fixture', 'Complete required maps', ?, ?)")
    .run(input.id, input.id, input.visibility ?? 1, input.lifecycle ?? "active");
  sqlite.prepare("INSERT INTO title_challenges (id,title_key,condition,evidence_rule,submission_mode,status,progress_rule,starts_at,ends_at,game_version,created_at,updated_at) VALUES (?, ?, 'Complete required maps', 'Verified Runs', 'manual', ?, ?, ?, ?, '26.0810.1', 1, 1)")
    .run(input.id, input.id, input.status ?? "active", JSON.stringify(input.rule ?? { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] }), input.startsAt ?? null, input.endsAt ?? null);
};

export const seedProgressReadRun = (sqlite: DatabaseSync, input: {
  id: string; createdAt: number; player?: string; map?: string; revision?: string;
  difficulty?: string; status?: string;
}) => {
  const player = input.player ?? "account-1";
  const map = input.map ?? "map.alpha";
  sqlite.prepare("INSERT INTO submissions (id,player_account_id,created_at,updated_at) VALUES (?, ?, ?, ?)")
    .run(`submission:${input.id}`, player, input.createdAt, input.createdAt);
  sqlite.prepare(`INSERT INTO mastery_runs
    (id,player_account_id,source_submission_id,map_id,gameplay_revision_id,difficulty,game_version,run_code,
     completion_duration_seconds,event_counters_json,acceptance_source,accepted_at,status,invalidated_at,
     invalidated_by,xp_rule_version,xp_input_snapshot_json,awarded_xp,created_at)
    VALUES (?, ?, ?, ?, ?, ?, '26.0810.1', ?, 60, '{}', 'submission_review', 1, ?, ?, ?, 'fixture', '{}', 1, 1)`)
    .run(input.id, player, `submission:${input.id}`, map, input.revision ?? `revision:${map}`, input.difficulty ?? "困难", input.id,
      input.status ?? "active", input.status === "invalidated" ? 2 : null, input.status === "invalidated" ? "admin.1" : null);
};

export const seedProgressReadSession = async (sqlite: DatabaseSync) => {
  sqlite.prepare("INSERT INTO portal_sessions (id,player_account_id,token_hash,expires_at) VALUES ('read-session', 'account-1', ?, ?)")
    .run(await hashRequest("read-token"), Date.now() + 60_000);
};
