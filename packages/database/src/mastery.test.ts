import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { VerifiedMasteryRunInput } from "@owbastion/domain";
import { createPlatformServices } from "./index";

const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  let pendingBatch: Promise<void> = Promise.resolve();
  const wrapStatement = (statementSql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() { return (sqlite.prepare(statementSql).get(...bound) as T | undefined) ?? null; },
      async all<T>() {
        const results = sqlite.prepare(statementSql).all(...bound) as T[];
        return { results, success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: results.length, rows_written: 0, last_row_id: 0, changed_db: false } };
      },
      async run() {
        const info = sqlite.prepare(statementSql).run(...bound);
        return { success: true, meta: { changes: Number(info.changes ?? 0), duration: 0, size_after: 0, rows_read: 0, rows_written: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0), changed_db: true } };
      },
      async raw<T extends unknown[] = unknown[]>() {
        const prepared = sqlite.prepare(statementSql);
        prepared.setReturnArrays(true);
        return prepared.all(...bound) as T[];
      },
    };
    return statement;
  };
  const database = {
    prepare(statementSql: string) { return wrapStatement(statementSql); },
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
  return { database, sqlite };
};

const hashRequest = async (value: unknown) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE player_accounts (id TEXT PRIMARY KEY NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE maps (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL, introduced_version TEXT NOT NULL, retired_version TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE gameplay_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    map_id TEXT NOT NULL REFERENCES maps(id),
    lifecycle TEXT NOT NULL,
    legacy_map_variant TEXT,
    copied_from_revision_id TEXT,
    reset_reason TEXT,
    game_version TEXT NOT NULL,
    spatial_config_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE bindings (id TEXT PRIMARY KEY NOT NULL, identity_id TEXT NOT NULL, player_account_id TEXT NOT NULL REFERENCES player_accounts(id), provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, status TEXT NOT NULL, revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE qq_sessions (id TEXT PRIMARY KEY NOT NULL, attempt_id TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL, environment TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE submissions (id TEXT PRIMARY KEY NOT NULL, binding_id TEXT NOT NULL REFERENCES bindings(id), gameplay_revision_id TEXT REFERENCES gameplay_revisions(id));
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
  CREATE TABLE mastery_run_conflict_resolutions (id TEXT PRIMARY KEY NOT NULL, mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id), conflict_submission_id TEXT NOT NULL REFERENCES submissions(id), action TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT, resolved_at INTEGER NOT NULL, UNIQUE (mastery_run_id, conflict_submission_id));
`);

const seed = (sqlite: DatabaseSync) => sqlite.exec(`
  INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES
    ('account-1', '1001', 'One', 'one', 1, 1), ('account-2', '1002', 'Two', 'two', 1, 1);
  INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES
    ('map.test', 'Test', '26.0810.1', 'active', '26.0810.1', 1, 1);
  INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES
    ('revision:map.test:initial', 'map.test', 'default', NULL, NULL, NULL, '26.0810.1', 1, 1);
  INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES
    ('binding-1', 'identity-1', 'account-1', 'qq', 'group-1', 'member-1', 'active', 1), ('binding-2', 'identity-2', 'account-2', 'qq', 'group-1', 'member-2', 'active', 1);
  INSERT INTO submissions (id, binding_id) VALUES
    ('submission-1', 'binding-1'), ('submission-2', 'binding-1'), ('submission-3', 'binding-2'), ('submission-4', 'binding-1'), ('submission-5', 'binding-1');
`);

const input = (overrides: Partial<VerifiedMasteryRunInput> = {}): VerifiedMasteryRunInput => ({
  playerAccountId: "account-1",
  sourceSubmissionId: "submission-1",
  mapId: "map.test",
  gameplayRevisionId: "revision:map.test:initial",
  mapVariant: null,
  difficulty: "困难",
  gameVersion: "26.0810.1",
  runCode: "1234-5678-9012",
  completionDurationSeconds: 600,
  deaths: 2,
  skips: 1,
  eventCounters: { "event.alpha": 2 },
  acceptanceSource: "submission_review",
  acceptedAt: 1_000,
  ...overrides,
});

describe("verified mastery run ledger", () => {
  it("enforces active player/run-code uniqueness while allowing a shared room code for another player", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seed(sqlite);
    const services = createPlatformServices(database);

    const created = await services.recordVerifiedMasteryRun(input());
    expect(created).toMatchObject({ outcome: "created", run: { playerAccountId: "account-1", runCode: "1234-5678-9012", awardedXp: 225, xpRuleVersion: "v1", xpInputSnapshot: { mapFactor: 1, performanceBonus: 0 } } });
    expect(await services.recordVerifiedMasteryRun(input())).toMatchObject({ outcome: "reused", run: { runId: created.run.runId } });
    expect(await services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-2", acceptedAt: 1_100 }))).toMatchObject({ outcome: "reused", run: { runId: created.run.runId } });
    expect(await services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-4", difficulty: "传奇", acceptedAt: 1_200 }))).toMatchObject({ outcome: "conflict", run: { runId: created.run.runId }, conflictFields: ["difficulty"] });
    expect(await services.recordVerifiedMasteryRun(input({ playerAccountId: "account-2", sourceSubmissionId: "submission-3", acceptedAt: 1_300 }))).toMatchObject({ outcome: "created", run: { playerAccountId: "account-2", runCode: "1234-5678-9012" } });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs").get()).toEqual({ count: 2 });
    expect(sqlite.prepare("SELECT transition, COUNT(*) AS count FROM mastery_run_lifecycle_events GROUP BY transition").all()).toEqual([{ transition: "accepted", count: 2 }]);
  });

  it("settles concurrent same-player run-code writes as one run without duplicate XP", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seed(sqlite);
    const services = createPlatformServices(database);

    const results = await Promise.all([
      services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-1" })),
      services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-2" })),
    ]);

    expect(results.map((result) => result.outcome).sort()).toEqual(["created", "reused"]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count, SUM(awarded_xp) AS awarded_xp FROM mastery_runs WHERE player_account_id = 'account-1'").get()).toEqual({ count: 1, awarded_xp: 225 });
    expect(sqlite.prepare("SELECT transition, COUNT(*) AS count FROM mastery_run_lifecycle_events GROUP BY transition").all()).toEqual([{ transition: "accepted", count: 1 }]);
    expect(await services.rebuildMasteryProfiles({ playerAccountId: "account-1" })).toMatchObject([{ totalXp: 225, verifiedRunCount: 1 }]);
  });

  it("rebuilds active projections and applies invalidation/restoration exactly once", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seed(sqlite);
    const services = createPlatformServices(database);
    const first = await services.recordVerifiedMasteryRun(input());
    const second = await services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-2", runCode: "2234-5678-9012", difficulty: "传奇", completionDurationSeconds: 500, deaths: 0, skips: 0, acceptedAt: 2_000 }));
    if (first.outcome !== "created" || second.outcome !== "created") throw new Error("fixture setup failed");

    const before = await services.rebuildMasteryProfiles({ playerAccountId: "account-1" });
    expect(before).toMatchObject([{ mapId: "map.test", totalXp: 720, verifiedRunCount: 2, lowestDeaths: 0, fewestSkips: 0, highestSingleRunXp: 495, highestCompletedDifficulty: "传奇" }]);
    await services.invalidateVerifiedMasteryRun({ masteryRunId: second.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    await services.invalidateVerifiedMasteryRun({ masteryRunId: second.run.runId, reason: "replay" }, { actorType: "user", actorId: "maintainer-1" });
    expect(await services.rebuildMasteryProfiles({ playerAccountId: "account-1" })).toMatchObject([{ mapId: "map.test", totalXp: 225, verifiedRunCount: 1, highestCompletedDifficulty: "困难" }]);
    await services.restoreVerifiedMasteryRun({ masteryRunId: second.run.runId }, { actorType: "user", actorId: "maintainer-1" });
    await services.restoreVerifiedMasteryRun({ masteryRunId: second.run.runId }, { actorType: "user", actorId: "maintainer-1" });
    expect(await services.rebuildMasteryProfiles({ playerAccountId: "account-1" })).toEqual(before);
    expect(sqlite.prepare("SELECT transition, COUNT(*) AS count FROM mastery_run_lifecycle_events GROUP BY transition ORDER BY transition").all()).toEqual([
      { transition: "accepted", count: 2 },
      { transition: "invalidated", count: 1 },
      { transition: "restored", count: 1 },
    ]);
  });

  it("does not restore an invalidated run over a newer active run with the same code", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seed(sqlite);
    const services = createPlatformServices(database);
    const original = await services.recordVerifiedMasteryRun(input());
    if (original.outcome !== "created") throw new Error("fixture setup failed");
    await services.invalidateVerifiedMasteryRun({ masteryRunId: original.run.runId }, { actorType: "user", actorId: "maintainer-1" });
    expect(await services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-2", acceptedAt: 2_000 }))).toMatchObject({ outcome: "created" });
    await expect(services.restoreVerifiedMasteryRun({ masteryRunId: original.run.runId }, { actorType: "user", actorId: "maintainer-1" })).rejects.toThrow("MASTERY_RUN_CODE_CONFLICT");
  });

  it("returns only the current player's active aggregate and privacy-safe mastery history", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seed(sqlite);
    const services = createPlatformServices(database);
    const first = await services.recordVerifiedMasteryRun(input());
    if (first.outcome !== "created") throw new Error("fixture setup failed");
    await services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-2", runCode: "2234-5678-9012", difficulty: "传奇", acceptedAt: 1_200 }));
    await services.invalidateVerifiedMasteryRun({ masteryRunId: first.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    await services.recordVerifiedMasteryRun(input({ playerAccountId: "account-2", sourceSubmissionId: "submission-3", acceptedAt: 1_100 }));
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("session-1", "attempt-1", "group-1", "member-1", "test", await hashRequest("mastery-session"), Date.now() + 60_000, 1);

    const projection = await services.getCurrentPlayerMastery({ sessionToken: "mastery-session", page: 1, pageSize: 20 });
    expect(projection).toMatchObject({ contractVersion: "1", profiles: [{ mapId: "map.test", verifiedRunCount: 1, highestCompletedDifficulty: "传奇" }], runs: [{ mapId: "map.test", status: "active" }, { mapId: "map.test", status: "invalidated" }], page: 1, pageSize: 20, total: 2, hasMore: false });
    expect(JSON.stringify(projection)).not.toMatch(/playerAccountId|sourceSubmissionId|runCode|gameVersion|eventCounters|acceptanceSource|xpInputSnapshot|invalidation/);
    await expect(services.getCurrentPlayerMastery({ sessionToken: "other-session", page: 1, pageSize: 20 })).resolves.toBeNull();
  });

  it("keeps each gameplay revision's progression independent and lets a re-enabled revision recover only its own profile", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seed(sqlite);
    const services = createPlatformServices(database);
    await services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-1", runCode: "1234-5678-9012", acceptedAt: 1_000 }));
    sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = 'revision:map.test:initial'").run();
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.test:rework', 'map.test', 'default', NULL, 'revision:map.test:initial', 'difficulty redesign', '26.0810.2', 2, 2)").run();
    await services.recordVerifiedMasteryRun(input({ sourceSubmissionId: "submission-2", gameplayRevisionId: "revision:map.test:rework", runCode: "2234-5678-9012", acceptedAt: 2_000 }));
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session-revision', 'attempt-revision', 'group-1', 'member-1', 'test', ?, ?, 1)")
      .run(await hashRequest("revision-session"), Date.now() + 60_000);

    const current = await services.getCurrentPlayerMastery({ sessionToken: "revision-session", mapId: "map.test", page: 1, pageSize: 20 });
    expect(current).toMatchObject({
      profiles: [{ gameplayRevisionId: "revision:map.test:rework", gameplayRevisionLifecycle: "default", verifiedRunCount: 1 }],
      runs: expect.arrayContaining([
        expect.objectContaining({ gameplayRevisionId: "revision:map.test:initial", gameplayRevisionLifecycle: "historical" }),
        expect.objectContaining({ gameplayRevisionId: "revision:map.test:rework", gameplayRevisionLifecycle: "default" }),
      ]),
    });
    expect(current.profiles).not.toContainEqual(expect.objectContaining({ gameplayRevisionId: "revision:map.test:initial" }));

    const historical = await services.getCurrentPlayerMastery({ sessionToken: "revision-session", mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20 });
    expect(historical).toMatchObject({ profiles: [{ gameplayRevisionId: "revision:map.test:initial", gameplayRevisionLifecycle: "historical", verifiedRunCount: 1 }], total: 1 });

    sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'selectable' WHERE id = 'revision:map.test:initial'").run();
    const selectable = await services.getCurrentPlayerMastery({ sessionToken: "revision-session", mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20 });
    expect(selectable).toMatchObject({ profiles: [{ gameplayRevisionId: "revision:map.test:initial", gameplayRevisionLifecycle: "selectable", verifiedRunCount: 1 }], total: 1 });
  });
});
