import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { evaluateCanonicalChallengeConditions, parseCanonicalChallengeConditions } from "@owbastion/domain";
import type { AdminAchievementCreateRequest, AdminChallengeUpdateRequest } from "@owbastion/contracts";
import type { AuthContext, VerifiedRunInput } from "@owbastion/domain";
import { createPlatformServices } from "./index";
import { assessChallengeOcrQuality } from "./ocr-response";

const createD1 = () => {
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

const hashRequest = async (value: unknown) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE player_accounts (id TEXT PRIMARY KEY NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE maps (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL, introduced_version TEXT NOT NULL, retired_version TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
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
  CREATE UNIQUE INDEX mastery_runs_active_player_run_code_idx ON mastery_runs(player_account_id, run_code) WHERE status = 'active';
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
  CREATE TABLE title_challenges (id TEXT PRIMARY KEY NOT NULL, title_key TEXT NOT NULL, category_override TEXT, condition TEXT NOT NULL, evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, game_version TEXT, status TEXT NOT NULL, introduced_version TEXT, retired_version TEXT, starts_at INTEGER, ends_at INTEGER, scope TEXT NOT NULL DEFAULT 'global', map_variant TEXT, progress_rule TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id));
  CREATE TABLE achievement_challenges (id TEXT PRIMARY KEY NOT NULL);
  CREATE TABLE mastery_run_conflict_resolutions (id TEXT PRIMARY KEY NOT NULL, mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id), conflict_submission_id TEXT NOT NULL REFERENCES submissions(id), action TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT, resolved_at INTEGER NOT NULL, UNIQUE (mastery_run_id, conflict_submission_id));
  CREATE TABLE ocr_results (manual INTEGER NOT NULL DEFAULT 0, callback_claimed INTEGER NOT NULL DEFAULT 0, id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, request_id TEXT, attempt INTEGER NOT NULL, status TEXT NOT NULL, response_json TEXT, match_json TEXT, error_code TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE ocr_accuracy_feedback (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, ocr_result_id TEXT NOT NULL, accuracy TEXT NOT NULL, marked_by TEXT NOT NULL, marked_by_type TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE submission_reviews (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT, reviewer TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE submission_spot_checks (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, status TEXT NOT NULL, policy_json TEXT NOT NULL, sampled_at INTEGER NOT NULL, resolved_at INTEGER, reviewer TEXT, reason TEXT);
`);

const seed = (sqlite: DatabaseSync) => sqlite.exec(`
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

const admin: AuthContext = { actorType: "user", subject: "admin.1", roles: ["maintainer"], provider: "test" };

const insertSubmission = (sqlite: DatabaseSync, id: string, playerAccountId: string, createdAt: number) =>
  sqlite.prepare("INSERT INTO submissions (id, player_account_id, binding_id, created_at, updated_at) VALUES (?, ?, 'binding-1', ?, ?)").run(id, playerAccountId, createdAt, createdAt);

const achievementInput = (overrides: Partial<AdminAchievementCreateRequest> = {}): AdminAchievementCreateRequest => ({
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

const runInput = (overrides: Partial<VerifiedRunInput>): VerifiedRunInput => ({
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

const progressCompletion = (sqlite: DatabaseSync) =>
  sqlite.prepare("SELECT id, status, source_type, source_id, gameplay_revision_id, invalidation_reason FROM challenge_completions WHERE source_type = 'verified_run_progress'").all() as { id: string; status: string; source_type: string; source_id: string; gameplay_revision_id: string | null; invalidation_reason: string | null }[];

const progressGrants = (sqlite: DatabaseSync) =>
  sqlite.prepare("SELECT id, player_account_id, status, source_type, source_id, granted_by, completion_id, revocation_type FROM player_title_grants WHERE granted_by = 'system:verified_run_progress' OR source_id IN (SELECT id FROM challenge_completions WHERE source_type = 'verified_run_progress')").all() as { id: string; player_account_id: string; status: string; source_type: string; source_id: string; granted_by: string; completion_id: string | null; revocation_type: string | null }[];

const canonicalChallengeIds = (sqlite: DatabaseSync) =>
  (sqlite.prepare("SELECT id, rule_version, conditions_json FROM challenges WHERE source_family = 'title_challenge' AND source_id = 'title.ANNIVERSARY_TOUR'").all() as { id: string; rule_version: string; conditions_json: string }[]);

const setup = () => {
  const harness = createD1();
  const { database, sqlite } = harness;
  installSchema(sqlite);
  seed(sqlite);
  const services = createPlatformServices(database);
  return { ...harness, services };
};

const seedProgressReadRule = (sqlite: DatabaseSync, input: {
  id: string;
  rule?: AdminAchievementCreateRequest["progressRule"];
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

const seedProgressReadRun = (sqlite: DatabaseSync, input: {
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

const seedProgressReadSession = async (sqlite: DatabaseSync) => {
  sqlite.prepare("INSERT INTO portal_sessions (id,player_account_id,token_hash,expires_at) VALUES ('read-session', 'account-1', ?, ?)")
    .run(await hashRequest("read-token"), Date.now() + 60_000);
};

describe("verified-run progress challenges", () => {
  it("keeps each public rule's mode, difficulty and submission window independent in one progress read", async () => {
    const { sqlite, services } = setup();
    const start = Date.now() - 50_000;
    const end = start + 100_000;
    sqlite.exec(`INSERT INTO gameplay_revisions (id,map_id,lifecycle,mode,game_version,created_at,updated_at) VALUES
      ('revision:map.alpha:mirror', 'map.alpha', 'selectable', '2026镜中回响', '26.0810.1', 1, 1),
      ('revision:map.beta:mirror', 'map.beta', 'selectable', '2026镜中回响', '26.0810.1', 1, 1);`);
    seedProgressReadRule(sqlite, { id: "regular", startsAt: start, endsAt: end, rule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "困难" } });
    seedProgressReadRule(sqlite, { id: "expert", startsAt: start, endsAt: end, rule: { type: "required_maps_completed", mapIds: ["map.alpha"], difficultyAtLeast: "专家" } });
    seedProgressReadRule(sqlite, { id: "earlier", startsAt: start - 1_000, endsAt: end, rule: { type: "required_maps_completed", mapIds: ["map.alpha"], difficultyAtLeast: "专家" } });
    seedProgressReadRule(sqlite, { id: "later", startsAt: start + 1, endsAt: end, rule: { type: "required_maps_completed", mapIds: ["map.alpha"] } });
    seedProgressReadRule(sqlite, { id: "mirror", startsAt: start, endsAt: end, rule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], mode: "2026 镜中回响", difficultyAtLeast: "专家" } });
    seedProgressReadRule(sqlite, { id: "private", visibility: 0 });
    seedProgressReadRule(sqlite, { id: "retired-challenge", status: "retired" });
    seedProgressReadRule(sqlite, { id: "retired-title", lifecycle: "retired" });
    seedProgressReadRule(sqlite, { id: "future", status: "scheduled", startsAt: end, rule: { type: "required_maps_completed", mapIds: ["map.alpha"] } });
    seedProgressReadRun(sqlite, { id: "at-start", createdAt: start });
    seedProgressReadRun(sqlite, { id: "before-start", createdAt: start - 1, difficulty: "专家" });
    seedProgressReadRun(sqlite, { id: "at-end", createdAt: end, map: "map.beta", difficulty: "专家" });
    seedProgressReadRun(sqlite, { id: "invalidated", createdAt: start + 1, map: "map.beta", status: "invalidated" });
    seedProgressReadRun(sqlite, { id: "another-player", createdAt: start + 1, map: "map.beta", player: "account-2", difficulty: "专家" });
    seedProgressReadRun(sqlite, { id: "mirror-alpha", createdAt: start + 1, revision: "revision:map.alpha:mirror", difficulty: "传奇" });
    seedProgressReadRun(sqlite, { id: "mirror-beta-at-end", createdAt: end, map: "map.beta", revision: "revision:map.beta:mirror", difficulty: "专家" });
    seedProgressReadRun(sqlite, { id: "unrelated-map", createdAt: start + 1, map: "map.gamma", difficulty: "地狱" });
    await seedProgressReadSession(sqlite);
    const response = await services.listCurrentPlayerChallengeProgress({ sessionToken: "read-token" });
    expect(response!.items.map(({ challengeId, completedMaps, satisfied, maps }) => ({ challengeId, completedMaps, satisfied, maps }))).toEqual([
      { challengeId: "earlier", completedMaps: 1, satisfied: true, maps: [{ mapId: "map.alpha", completed: true }] },
      { challengeId: "expert", completedMaps: 0, satisfied: false, maps: [{ mapId: "map.alpha", completed: false }] },
      { challengeId: "future", completedMaps: 0, satisfied: false, maps: [{ mapId: "map.alpha", completed: false }] },
      { challengeId: "later", completedMaps: 0, satisfied: false, maps: [{ mapId: "map.alpha", completed: false }] },
      { challengeId: "mirror", completedMaps: 1, satisfied: false, maps: [{ mapId: "map.alpha", completed: true }, { mapId: "map.beta", completed: false }] },
      { challengeId: "regular", completedMaps: 1, satisfied: false, maps: [{ mapId: "map.alpha", completed: true }, { mapId: "map.beta", completed: false }] },
    ]);
    expect(response!.items.find((item) => item.challengeId === "future")!.status).toBe("scheduled");
  });

  it("uses a fixed query budget as progress challenges grow and transfers no duplicate run history", async () => {
    const { sqlite, services, resetQueryMetrics, queryMetrics, capturedReadStatements } = setup();
    sqlite.exec(`
      CREATE INDEX mastery_runs_active_player_map_accepted_idx
        ON mastery_runs(player_account_id, map_id, accepted_at DESC) WHERE status = 'active';
      CREATE INDEX mastery_runs_active_player_map_revision_accepted_idx
        ON mastery_runs(player_account_id, map_id, gameplay_revision_id, accepted_at DESC) WHERE status = 'active';
      CREATE INDEX mastery_runs_player_accepted_idx
        ON mastery_runs(player_account_id, accepted_at DESC, id DESC);
    `);
    seedProgressReadRule(sqlite, { id: "scale-0" });
    seedProgressReadRun(sqlite, { id: "original", createdAt: 100 });
    await seedProgressReadSession(sqlite);
    resetQueryMetrics();
    const initial = await services.listCurrentPlayerChallengeProgress({ sessionToken: "read-token" });
    const initialMetrics = queryMetrics();
    for (let index = 1; index < 40; index += 1) seedProgressReadRule(sqlite, { id: `scale-${index}` });
    resetQueryMetrics();
    const grown = await services.listCurrentPlayerChallengeProgress({ sessionToken: "read-token" });
    const grownMetrics = queryMetrics();
    expect(initial!.items).toHaveLength(1);
    expect(grown!.items).toHaveLength(40);
    expect(grownMetrics.statementCount).toBe(initialMetrics.statementCount);
    for (let index = 0; index < 200; index += 1) seedProgressReadRun(sqlite, { id: `duplicate-${index}`, createdAt: 100 });
    resetQueryMetrics();
    expect(await services.listCurrentPlayerChallengeProgress({ sessionToken: "read-token" })).toEqual(grown);
    expect(queryMetrics()).toEqual(grownMetrics);
    expect(grownMetrics.progressResultRows).toBeLessThanOrEqual(40);
    const lookupPlans = capturedReadStatements().flatMap(({ sql, parameters }) =>
      sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters) as Array<{ detail: string }>);
    expect(lookupPlans.some(({ detail }) => /SEARCH .* USING INDEX .*\(player_account_id=\? AND map_id=\?\)/.test(detail))).toBe(true);
  });

  it("completes and grants only after every required map has an eligible active run", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);

    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-1" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));

    const completions = progressCompletion(sqlite);
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ status: "active", source_type: "verified_run_progress", source_id: "account-1", gameplay_revision_id: null });
    const grants = progressGrants(sqlite);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ status: "active", source_type: "automatic", source_id: "title.ANNIVERSARY_TOUR:account-1", granted_by: "system:verified_run_progress", completion_id: completions[0]!.id });
    expect(canonicalChallengeIds(sqlite)).toHaveLength(1);
    expect(JSON.parse(canonicalChallengeIds(sqlite)[0]!.conditions_json)).toEqual({ operator: "and", conditions: [{ type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] }] });
  });

  it("counts only runs on the rule's standalone-mode revisions", async () => {
    const { sqlite, services } = setup();
    sqlite.exec(`
      INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES
        ('revision:map.alpha:mirror', 'map.alpha', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1),
        ('revision:map.beta:mirror', 'map.beta', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1);
      INSERT INTO standalone_modes (mode, event_weight_total, created_at, updated_at) VALUES ('2026镜中回响', NULL, 1, 1);
    `);
    await services.createAdminAchievement(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], mode: "2026 镜中回响" } }), admin, "create.mode");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    insertSubmission(sqlite, "submission-3", "account-1", 700);
    insertSubmission(sqlite, "submission-4", "account-1", 800);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha:mirror", sourceSubmissionId: "submission-3", matchCode: "3456-7890-1234" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta:mirror", sourceSubmissionId: "submission-4", matchCode: "4567-8901-2345" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
    expect(JSON.parse(canonicalChallengeIds(sqlite)[0]!.conditions_json).conditions[0]).toMatchObject({ mode: "2026镜中回响" });
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES ('session-1', 'account-1', ?, ?)").run(await hashRequest("session-token"), Date.now() + 60_000);
    expect((await services.listCurrentPlayerChallengeProgress({ sessionToken: "session-token" }))!.items[0]).toMatchObject({
      progressRule: { mode: "2026镜中回响" },
      satisfied: true,
    });
  });

  it("follows every map of its standalone mode when the rule lists none", async () => {
    const { sqlite, services } = setup();
    const save = (mapIds: string[], key: string) => services.upsertAdminStandaloneMode({ contractVersion: "1", mode: "2026镜中回响", mapIds, eventPools: [], eventWeightTotal: null }, admin, key);
    await expect(services.createAdminAchievement(achievementInput({ progressRule: { type: "required_maps_completed", mode: "2026镜中回响" } }), admin, "create.unknown-mode")).rejects.toThrow("STANDALONE_MODE_NOT_FOUND");
    await save(["map.alpha", "map.beta"], "mode.two");
    await services.createAdminAchievement(achievementInput({ progressRule: { type: "required_maps_completed", mode: "2026镜中回响" } }), admin, "create.follow");
    const mirror = (mapId: string) => (sqlite.prepare("SELECT id FROM gameplay_revisions WHERE map_id = ? AND mode = '2026镜中回响'").get(mapId) as { id: string }).id;
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: mirror("map.alpha"), sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: mirror("map.beta"), sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(JSON.parse(canonicalChallengeIds(sqlite)[0]!.conditions_json)).toEqual({ operator: "and", conditions: [{ type: "required_maps_completed", mode: "2026镜中回响" }] });

    // A map added to the mode joins the requirement and the follow-on rule is reconciled at once.
    await save(["map.alpha", "map.beta", "map.gamma"], "mode.three");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
    // The rule keeps one canonical identity while its maps follow the mode.
    expect(canonicalChallengeIds(sqlite)).toHaveLength(1);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES ('session-1', 'account-1', ?, ?)").run(await hashRequest("session-token"), Date.now() + 60_000);
    expect((await services.listCurrentPlayerChallengeProgress({ sessionToken: "session-token" }))!.items[0]).toMatchObject({
      maps: [{ mapId: "map.alpha", completed: true }, { mapId: "map.beta", completed: true }, { mapId: "map.gamma", completed: false }],
      completedMaps: 2,
      satisfied: false,
    });
  });

  it("keeps standalone-mode runs out of a regular progress rule", async () => {
    const { sqlite, services } = setup();
    sqlite.exec(`
      INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES
        ('revision:map.alpha:mirror', 'map.alpha', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1),
        ('revision:map.beta:mirror', 'map.beta', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1);
    `);
    await services.createAdminAchievement(achievementInput(), admin, "create.regular");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha:mirror", sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta:mirror", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);
  });

  it("keeps progress open for another player and counts only their own runs", async () => {
    const { sqlite, services } = setup();
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding-2', 'identity-2', 'account-2', 'qq', 'group-1', 'member-2', 'active', 1)").run();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-2", 600);

    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ playerAccountId: "account-2", mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2" }));
    expect(progressCompletion(sqlite)).toEqual([]);
  });

  it("honours the minimum difficulty threshold per map", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha"], difficultyAtLeast: "专家" } }), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);

    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-2", difficulty: "专家", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("applies the event window to the source submission creation time", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput({ status: "scheduled", gameVersion: "26.0810.1", startsAt: 1_000, endsAt: 2_000 }), admin, "create.1");
    // Runs recorded against submissions outside [startsAt, endsAt) do not count.
    insertSubmission(sqlite, "submission-early", "account-1", 500);
    insertSubmission(sqlite, "submission-alpha", "account-1", 1_500);
    insertSubmission(sqlite, "submission-late", "account-1", 2_500);
    insertSubmission(sqlite, "submission-beta", "account-1", 1_999);

    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-early" }));
    expect(progressCompletion(sqlite)).toEqual([]);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-alpha", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-late", matchCode: "3456-7890-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-beta", matchCode: "4567-8901-2345" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("invalidates and restores the derived completion and grant with the run", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const betaRun = await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);

    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated", invalidation_reason: "evidence invalidated" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "revoked", revocation_type: "evidence" }]);

    await services.transitionAdminVerifiedRun({ contractVersion: "1", verifiedRunId: betaRun.run.runId, action: "restore" }, admin, "restore.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active", revocation_type: null }]);
  });

  it("reconciles when an admin corrects run facts across required maps", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const gammaRun = await services.recordVerifiedRun(runInput({ mapId: "map.gamma", gameplayRevisionId: "revision:map.gamma", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    await services.correctAdminVerifiedRun({ contractVersion: "1", verifiedRunId: gammaRun.run.runId, changes: { mapId: "map.beta", gameplayRevisionId: "revision:map.beta" }, reason: "map attribution corrected" }, admin, "correct.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("stays idempotent under repeated runs and reconciliation", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    insertSubmission(sqlite, "submission-3", "account-1", 700);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const betaRun = await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toHaveLength(1);
    expect(progressGrants(sqlite)).toHaveLength(1);

    // A new run on an already-satisfied map re-triggers reconciliation.
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-3", matchCode: "3456-7890-1234" }));
    expect(progressCompletion(sqlite)).toHaveLength(1);
    expect(progressGrants(sqlite)).toHaveLength(1);

    // A replayed record reconciles the same run again without duplicating rows.
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    expect(progressCompletion(sqlite)).toHaveLength(1);
    expect(progressGrants(sqlite)).toHaveLength(1);

    // A no-op status transition replays the reconciliation path harmlessly.
    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressCompletion(sqlite)).toHaveLength(1);
  });

  it("reconciles already-eligible players when the challenge is created", async () => {
    const { sqlite, services } = setup();
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("rejects progress rules with incompatible scope, submission mode, or maps", async () => {
    const { sqlite, services } = setup();
    await expect(services.createAdminAchievement(achievementInput({ scope: "map", mapIds: ["map.alpha"] }), admin, "reject.scope")).rejects.toThrow("INVALID_MAP_SCOPE");
    await expect(services.createAdminAchievement(achievementInput({ submissionMode: "automatic" }), admin, "reject.mode")).rejects.toThrow("INVALID_SUBMISSION_MODE");
    await expect(services.createAdminAchievement(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.missing"] } }), admin, "reject.map")).rejects.toThrow("MAP_NOT_FOUND");
    await expect(services.createAdminAchievement(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.retired"] } }), admin, "reject.retired")).rejects.toThrow("MAP_NOT_ACTIVE");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM title_challenges").get()).toEqual({ count: 0 });
  });

  it("re-evaluates players when an admin edits or removes the progress rule", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha"] } }), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);

    const update = (overrides: Partial<AdminChallengeUpdateRequest>): AdminChallengeUpdateRequest => ({
      contractVersion: "1",
      family: "achievement",
      challengeId: "title.ANNIVERSARY_TOUR",
      condition: "在活动期间完成全部指定地图",
      evidenceRule: "由已核实成绩自动判定",
      submissionMode: "manual",
      categoryOverride: null,
      status: "active",
      gameVersion: "26.0810.1",
      ...overrides,
    } as AdminChallengeUpdateRequest);

    // Widening the required set mints a new canonical rule identity; the
    // player no longer satisfies it, so the superseded mirror is invalidated
    // and the single derived grant is revoked.
    await services.updateAdminChallenge(update({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] } }), admin, "update.widen");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "revoked", revocation_type: "evidence" }]);

    // Completing the new rule restores the same grant row, relinked to the
    // completion under the new canonical identity.
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    const completions = progressCompletion(sqlite);
    expect(completions).toHaveLength(2);
    expect(completions.filter((completion) => completion.status === "active")).toHaveLength(1);
    const grants = progressGrants(sqlite);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ status: "active", source_id: "title.ANNIVERSARY_TOUR:account-1", completion_id: completions.find((completion) => completion.status === "active")!.id });

    // Removing the rule turns it back into a screenshot challenge and clears
    // the derived mirror: the completion is invalidated and the grant revoked.
    await services.updateAdminChallenge(update({ progressRule: null }), admin, "update.remove");
    expect(sqlite.prepare("SELECT progress_rule FROM title_challenges WHERE id = 'title.ANNIVERSARY_TOUR'").get()).toEqual({ progress_rule: null });
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }, { status: "invalidated" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "revoked" }]);
  });

  it("exposes privacy-safe per-map progress to the owning player only", async () => {
    const { sqlite, services } = setup();
    const startsAt = Date.now() - 60_000;
    const endsAt = Date.now() + 3_600_000;
    await services.createAdminAchievement(achievementInput({ status: "scheduled", startsAt, endsAt, progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "困难" } }), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", startsAt + 1);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1", acceptedAt: startsAt + 1 }));
    const tokenHash = await hashRequest("session-token");
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES ('session-1', 'account-1', ?, ?)").run(tokenHash, Date.now() + 60_000);

    const response = await services.listCurrentPlayerChallengeProgress({ sessionToken: "session-token" });
    expect(response).not.toBeNull();
    expect(response!.items).toHaveLength(1);
    expect(response!.items[0]).toMatchObject({
      challengeId: "title.ANNIVERSARY_TOUR",
      titleKey: "ANNIVERSARY_TOUR",
      status: "active",
      startsAt,
      endsAt,
      progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "困难" },
      maps: [{ mapId: "map.alpha", completed: true }, { mapId: "map.beta", completed: false }],
      completedMaps: 1,
      satisfied: false,
    });
    expect(Object.keys(response!.items[0]!).sort()).toEqual(["challengeId", "completedMaps", "endsAt", "icon", "maps", "progressRule", "satisfied", "startsAt", "status", "titleKey", "titleName"].sort());

    expect(await services.listCurrentPlayerChallengeProgress({ sessionToken: "unknown-token" })).toBeNull();
  });

  it("scopes grant mutations to the reconciled player", async () => {
    const { sqlite, services } = setup();
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding-2', 'identity-2', 'account-2', 'qq', 'group-1', 'member-2', 'active', 1)").run();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    insertSubmission(sqlite, "submission-3", "account-2", 500);
    insertSubmission(sqlite, "submission-4", "account-2", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    await services.recordVerifiedRun(runInput({ playerAccountId: "account-2", sourceSubmissionId: "submission-3", matchCode: "3456-7890-1234" }));
    const betaRun2 = await services.recordVerifiedRun(runInput({ playerAccountId: "account-2", mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-4", matchCode: "4567-8901-2345" }));

    const grants = progressGrants(sqlite);
    expect(grants).toHaveLength(2);
    expect(grants.map(({ player_account_id }) => player_account_id).sort()).toEqual(["account-1", "account-2"]);

    await services.invalidateVerifiedRun({ verifiedRunId: betaRun2.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressGrants(sqlite)).toMatchObject([
      { player_account_id: "account-1", status: "active" },
      { player_account_id: "account-2", status: "revoked", revocation_type: "evidence" },
    ]);
    const completions = progressCompletion(sqlite);
    expect(completions.filter((completion) => completion.status === "active")).toHaveLength(1);
    expect(completions.filter((completion) => completion.status === "invalidated")).toHaveLength(1);

    await services.transitionAdminVerifiedRun({ contractVersion: "1", verifiedRunId: betaRun2.run.runId, action: "restore" }, admin, "restore.1");
    expect(progressGrants(sqlite)).toMatchObject([
      { player_account_id: "account-1", status: "active" },
      { player_account_id: "account-2", status: "active", revocation_type: null },
    ]);
  });

  it("repairs the derived mirror on same-state Verified Run retries", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const betaRun = await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);

    // The authoritative run mutation committed while the derived
    // reconciliation did not: the mirror stays active on an invalidated run.
    sqlite.prepare("UPDATE mastery_runs SET status = 'invalidated' WHERE id = ?").run(betaRun.run.runId);
    const breakMirror = () => {
      sqlite.prepare("UPDATE challenge_completions SET status = 'active', invalidated_by = NULL, invalidated_at = NULL, invalidation_reason = NULL WHERE source_type = 'verified_run_progress'").run();
      sqlite.prepare("UPDATE player_title_grants SET status = 'active', revoked_by = NULL, revoked_at = NULL, revoke_reason = NULL, revocation_type = NULL WHERE granted_by = 'system:verified_run_progress'").run();
    };
    const expectRepaired = () => {
      expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
      expect(progressGrants(sqlite)).toMatchObject([{ status: "revoked" }]);
    };

    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    expectRepaired();

    breakMirror();
    await services.transitionAdminVerifiedRun({ contractVersion: "1", verifiedRunId: betaRun.run.runId, action: "invalidate" }, admin, "noop.invalidate");
    expectRepaired();

    breakMirror();
    await services.correctAdminVerifiedRun({ contractVersion: "1", verifiedRunId: betaRun.run.runId, changes: { difficulty: "困难" } }, admin, "noop.correct");
    expectRepaired();

    breakMirror();
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expectRepaired();
  });

  it("re-runs the create backfill on a replayed request", async () => {
    const { sqlite, services } = setup();
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    const input = achievementInput();
    await services.createAdminAchievement(input, admin, "create.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);

    // The create batch committed but the backfill mirror never landed.
    sqlite.prepare("DELETE FROM challenge_completions WHERE source_type = 'verified_run_progress'").run();
    sqlite.prepare("DELETE FROM player_title_grants WHERE granted_by = 'system:verified_run_progress'").run();
    await services.createAdminAchievement(input, admin, "create.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("re-runs reconciliation on a replayed spot-check revocation", async () => {
    const { sqlite, services } = setup();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const betaRun = await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES ('outcome-1', 'submission-2', 'verified_run', 'verified_run', 'created', ?, 0, '{}', 1, 1)").run(betaRun.run.runId);
    sqlite.prepare("INSERT INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at) VALUES ('spot-1', 'submission-2', 'pending', '{}', 1)").run();

    await services.resolveAdminSubmissionSpotCheck({ submissionId: "submission-2", contractVersion: "1", decision: "revoked" }, admin, "spot.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "revoked" }]);

    // The revocation batch committed while the derived reconciliation did not.
    sqlite.prepare("UPDATE challenge_completions SET status = 'active', invalidated_by = NULL, invalidated_at = NULL, invalidation_reason = NULL WHERE source_type = 'verified_run_progress'").run();
    sqlite.prepare("UPDATE player_title_grants SET status = 'active', revoked_by = NULL, revoked_at = NULL, revoke_reason = NULL, revocation_type = NULL WHERE granted_by = 'system:verified_run_progress'").run();
    await services.resolveAdminSubmissionSpotCheck({ submissionId: "submission-2", contractVersion: "1", decision: "revoked" }, admin, "spot.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "revoked" }]);
  });

  it("keeps aggregate conditions out of screenshot evidence evaluation", async () => {
    const conditions = parseCanonicalChallengeConditions(JSON.stringify({ operator: "and", conditions: [{ type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] }] }));
    const evaluation = evaluateCanonicalChallengeConditions(conditions, { mapId: "map.alpha", completed: true, difficulty: "地狱", achievementTitles: ["到此一游"] });
    expect(evaluation.matched).toBe(false);

    // The quality gate also demands evidence fields OCR can never provide.
    const quality = assessChallengeOcrQuality(conditions, { ok: true, fields: {}, data: {} });
    expect(quality.accepted).toBe(false);
    expect(quality.reasons).toContain("verified_runs:missing_value");

    // The public catalog still exposes the rule so clients can render progress.
    const { services } = setup();
    await services.createAdminAchievement(achievementInput(), admin, "create.1");
    const publicList = await services.listChallenges({ family: "achievement" });
    expect(publicList).toMatchObject([{ challengeId: "title.ANNIVERSARY_TOUR", progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] } }]);
  });
});
