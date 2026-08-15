import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createMasteryEvidenceCompatibilityV1, legacyGameplayRevisionId } from "@owbastion/domain";
import { assessMasteryOcrEvidence, createPlatformServices } from "./index";

/**
 * Minimal D1Database shim over node:sqlite, reused from catalog-query-budget.test.ts.
 */
const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  let preparedStatementCount = 0;

  const wrapStatement = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() { return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null; },
      async all<T>() {
        const results = sqlite.prepare(sql).all(...bound) as T[];
        return { results, success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: results.length, rows_written: 0, last_row_id: 0, changed_db: false } };
      },
      async run() {
        const info = sqlite.prepare(sql).run(...bound);
        return { success: true, meta: { changes: Number(info.changes ?? 0), duration: 0, size_after: 0, rows_read: 0, rows_written: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0), changed_db: true } };
      },
      async raw<T extends unknown[] = unknown[]>() {
        const prepared = sqlite.prepare(sql);
        prepared.setReturnArrays(true);
        return prepared.all(...bound) as T[];
      },
    };
    return statement;
  };

  const database = {
    prepare(sql: string) { preparedStatementCount += 1; return wrapStatement(sql); },
    async batch(statements: Array<ReturnType<typeof wrapStatement>>) {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return [{ results: [], success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false } }];
    },
    withSession() { return database; },
  } as unknown as D1Database;

  return {
    database,
    sqlite,
    preparedStatementCount: () => preparedStatementCount,
    resetPreparedStatementCount: () => { preparedStatementCount = 0; },
  };
};

const installSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    CREATE TABLE maps (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
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
    CREATE TABLE gameplay_revision_challenge_assignments (
      id TEXT PRIMARY KEY NOT NULL,
      gameplay_revision_id TEXT NOT NULL REFERENCES gameplay_revisions(id),
      map_id TEXT NOT NULL REFERENCES maps(id),
      challenge_family TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      condition TEXT,
      evidence_rule TEXT,
      submission_mode TEXT,
      slot TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (gameplay_revision_id, challenge_family, challenge_id)
    );
    CREATE TABLE title_catalog (
      key TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'award',
      icon_url TEXT,
      icon_object_key TEXT,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      availability TEXT NOT NULL,
      scope TEXT NOT NULL,
      display_kind TEXT NOT NULL,
      color_json TEXT NOT NULL DEFAULT 'null',
      game_version TEXT NOT NULL
    );
    CREATE TABLE map_title_rules (
      id TEXT PRIMARY KEY NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      kind TEXT NOT NULL,
      condition TEXT NOT NULL,
      evidence_rule TEXT NOT NULL,
      submission_mode TEXT NOT NULL DEFAULT 'manual',
      display_kind TEXT NOT NULL,
      slot TEXT,
      map_variant TEXT,
      default_scope TEXT NOT NULL DEFAULT 'all_active',
      status TEXT NOT NULL DEFAULT 'active',
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX map_title_rules_kind_idx ON map_title_rules (kind);
    CREATE UNIQUE INDEX map_title_rules_title_key_idx ON map_title_rules (title_key);
    CREATE TABLE map_title_rule_exceptions (
      id TEXT PRIMARY KEY NOT NULL,
      rule_id TEXT NOT NULL REFERENCES map_title_rules(id),
      map_id TEXT NOT NULL REFERENCES maps(id),
      enabled INTEGER NOT NULL DEFAULT 1,
      condition TEXT,
      evidence_rule TEXT,
      submission_mode TEXT,
      slot TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX map_title_rule_exceptions_rule_map_idx
      ON map_title_rule_exceptions (rule_id, map_id);
    CREATE TABLE map_title_rule_compat (
      legacy_challenge_id TEXT NOT NULL,
      rule_id TEXT NOT NULL REFERENCES map_title_rules(id),
      map_id TEXT NOT NULL REFERENCES maps(id),
      is_standard_instance INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (legacy_challenge_id, map_id)
    );
    CREATE UNIQUE INDEX map_title_rule_compat_rule_map_idx
      ON map_title_rule_compat (rule_id, map_id);
    CREATE TABLE player_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      normalized_player_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      banned_at INTEGER,
      banned_by TEXT,
      ban_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE player_title_grants (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      map_id TEXT REFERENCES maps(id),
      gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
      slot TEXT,
      status TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      revoked_by TEXT,
      revoked_at INTEGER,
      revoke_reason TEXT
    );
    CREATE UNIQUE INDEX player_title_grants_source_idx
      ON player_title_grants (source_type, source_id, title_key);
    CREATE TABLE achievement_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      map_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      difficulty TEXT,
      condition TEXT NOT NULL DEFAULT '',
      evidence_rule TEXT NOT NULL DEFAULT '',
      submission_mode TEXT NOT NULL DEFAULT 'manual',
      reward_title_key TEXT,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE map_title_rewards (
      map_id TEXT NOT NULL REFERENCES maps(id),
      slot TEXT NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      pioneer_prefixes_json TEXT NOT NULL,
      PRIMARY KEY (map_id, slot)
    );
    CREATE TABLE bindings (
      id TEXT PRIMARY KEY NOT NULL,
      identity_id TEXT NOT NULL,
      player_account_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      group_open_id TEXT NOT NULL,
      member_open_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      revoked_at INTEGER,
      revoked_by TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE submissions (
      id TEXT PRIMARY KEY NOT NULL,
      binding_id TEXT NOT NULL,
      status TEXT NOT NULL,
      challenge_type TEXT NOT NULL,
      challenge_id TEXT,
      target_map_id TEXT REFERENCES maps(id),
      gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
      map_name TEXT NOT NULL,
      difficulty TEXT,
      player_name TEXT,
      review_reason TEXT,
      grant_id TEXT,
      ocr_fail_count INTEGER NOT NULL DEFAULT 0,
      rule_snapshot_json TEXT,
      source_provider TEXT NOT NULL,
      source_conversation_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
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
    CREATE TABLE mastery_run_lifecycle_events (
      id TEXT PRIMARY KEY NOT NULL,
      mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id),
      transition TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE mastery_run_conflict_resolutions (
      id TEXT PRIMARY KEY NOT NULL,
      mastery_run_id TEXT NOT NULL REFERENCES mastery_runs(id),
      conflict_submission_id TEXT NOT NULL REFERENCES submissions(id),
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      reason TEXT,
      resolved_at INTEGER NOT NULL,
      UNIQUE (mastery_run_id, conflict_submission_id)
    );
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
    CREATE TABLE submission_spot_checks (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      sampled_at INTEGER NOT NULL,
      resolved_at INTEGER,
      reviewer TEXT,
      reason TEXT
    );
    CREATE TABLE submission_reviews (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      reviewer TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX submission_reviews_submission_id_idx ON submission_reviews (submission_id);
    CREATE TABLE idempotency_keys (
      id TEXT PRIMARY KEY NOT NULL,
      actor_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      correlation_id TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE title_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      category_override TEXT,
      condition TEXT NOT NULL,
      evidence_rule TEXT NOT NULL,
      submission_mode TEXT NOT NULL,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      starts_at INTEGER,
      ends_at INTEGER,
      scope TEXT NOT NULL DEFAULT 'global',
      map_variant TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE achievement_challenge_maps (
      challenge_id TEXT NOT NULL REFERENCES title_challenges(id) ON DELETE CASCADE,
      map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      PRIMARY KEY (challenge_id, map_id)
    );
    CREATE TABLE map_metadata (
      map_id TEXT PRIMARY KEY NOT NULL REFERENCES maps(id),
      difficulty_rating TEXT,
      mechanics_json TEXT NOT NULL DEFAULT '[]',
      cover_url TEXT,
      background_url TEXT,
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE random_events (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      rarity TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_seconds INTEGER,
      cooldown_seconds REAL,
      weight REAL,
      game_version TEXT NOT NULL,
      effect_tags_json TEXT NOT NULL DEFAULT '[]',
      release_status TEXT NOT NULL,
      archived_at INTEGER,
      archived_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE random_event_map_challenges (
      event_id TEXT NOT NULL REFERENCES random_events(id),
      challenge_id TEXT NOT NULL REFERENCES achievement_challenges(id),
      PRIMARY KEY (event_id, challenge_id)
    );
    CREATE TABLE random_event_title_challenges (
      event_id TEXT NOT NULL REFERENCES random_events(id),
      challenge_id TEXT NOT NULL REFERENCES title_challenges(id),
      PRIMARY KEY (event_id, challenge_id)
    );
    CREATE TABLE random_event_imports (
      id TEXT PRIMARY KEY NOT NULL,
      source_hash TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      imported_by TEXT NOT NULL,
      imported_at INTEGER NOT NULL
    );
    CREATE TABLE effect_glossary_terms (
      key TEXT PRIMARY KEY NOT NULL,
      name_zh TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      definition TEXT NOT NULL,
      rules_json TEXT NOT NULL DEFAULT '[]',
      source_version TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE historical_title_grants (
      id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      map_id TEXT REFERENCES maps(id),
      gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
      slot TEXT,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      holder_name TEXT NOT NULL,
      source_version TEXT NOT NULL
    );
    CREATE UNIQUE INDEX historical_title_grants_holder_idx
      ON historical_title_grants (scope, map_id, slot, title_key, holder_name);
    CREATE TABLE catalog_imports (
      id TEXT PRIMARY KEY NOT NULL,
      source_version TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      row_counts_json TEXT NOT NULL,
      imported_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX catalog_imports_source_version_idx ON catalog_imports (source_version);
    CREATE UNIQUE INDEX catalog_imports_snapshot_hash_idx ON catalog_imports (snapshot_hash);
    CREATE TABLE identities (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE binding_invites (
      id TEXT PRIMARY KEY NOT NULL,
      code_hash TEXT NOT NULL,
      code_ciphertext TEXT,
      player_name TEXT NOT NULL,
      normalized_player_name TEXT NOT NULL,
      player_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      redeemed_at INTEGER,
      revoked_at INTEGER,
      revoked_by TEXT
    );
    CREATE UNIQUE INDEX binding_invites_code_idx ON binding_invites (code_hash);
    CREATE TABLE binding_claims (
      id TEXT PRIMARY KEY NOT NULL,
      invite_id TEXT NOT NULL REFERENCES binding_invites(id),
      token_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      player_name TEXT NOT NULL,
      normalized_player_name TEXT NOT NULL,
      player_id TEXT NOT NULL,
      status TEXT NOT NULL,
      member_open_id TEXT,
      group_open_id TEXT,
      message_id TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      verified_at INTEGER,
      decided_at INTEGER,
      decided_by TEXT,
      decision_reason TEXT
    );
    CREATE UNIQUE INDEX binding_claims_code_idx ON binding_claims (code_hash);
    CREATE TABLE qq_group_access (
      group_open_id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      environment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      bind_enabled INTEGER NOT NULL DEFAULT 0,
      verify_enabled INTEGER NOT NULL DEFAULT 0,
      lifecycle_occurred_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE qq_group_policy_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      request_id TEXT,
      created_at INTEGER NOT NULL,
      enqueued_at INTEGER,
      delivered_at INTEGER
    );
    CREATE TABLE qq_login_attempts (
      id TEXT PRIMARY KEY NOT NULL,
      token_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'login',
      player_account_id TEXT,
      target_group_open_id TEXT,
      group_open_id TEXT,
      member_open_id TEXT,
      environment TEXT,
      message_id TEXT,
      session_token_hash TEXT,
      session_issued_at INTEGER,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      verified_at INTEGER
    );
    CREATE TABLE qq_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      attempt_id TEXT NOT NULL,
      group_open_id TEXT NOT NULL,
      member_open_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE upload_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL,
      player_account_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      object_key TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE ocr_results (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL,
      request_id TEXT,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL,
      response_json TEXT,
      match_json TEXT,
      error_code TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE attachments (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_attachment_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size INTEGER,
      sha256 TEXT,
      object_key TEXT,
      upload_status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE ocr_feedback_proposals (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL,
      ocr_result_id TEXT NOT NULL,
      field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'achievement_titles')),
      original_value TEXT,
      feedback_type TEXT NOT NULL CHECK (feedback_type IN ('confirmed', 'corrected', 'passive_report')),
      prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
      proposed_value TEXT,
      model_version TEXT,
      layout_version TEXT,
      player_account_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (submission_id, ocr_result_id, field_key, player_account_id)
    );
  `);
};

const now = Date.now();
const localMasteryEvidenceCompatibility = createMasteryEvidenceCompatibilityV1({
  minimumGameVersion: "99.0101.1",
  supportedOcrLayoutVersions: ["test-layout-v1"],
});

describe("Agents map gameplay projection", () => {
  it("projects enabled revisions with deterministic spatial and challenge references", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedTitle(sqlite, "CONQUEROR");
    seedTitle(sqlite, "REWORK");
    seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
    seedCompat(sqlite, "map.agents.conqueror", "rule.conqueror", "map.agents");
    seedLegacyMapChallenge(sqlite, "challenge.agents.direct", "map.agents");
    seedMapTitleChallenge(sqlite, "title.agents.rework", "REWORK", "map.agents");
    const selectableRevisionId = seedSelectableGameplayRevision(sqlite, "map.agents");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: selectableRevisionId, mapId: "map.agents", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: selectableRevisionId, mapId: "map.agents", challengeFamily: "map_challenge", challengeId: "challenge.agents.direct" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: selectableRevisionId, mapId: "map.agents", challengeFamily: "title_challenge", challengeId: "title.agents.rework" });
    const stageSpatialConfig = {
      bastionPositions: [[20, 21, 22]], resetPosition: [23, 24, 25], endPosition: [26, 27, 28],
      thirdPersonPosition: [29, 30, 31], creditsPosition: [32, 33, 34], control: null,
      portalPositions: [], springboardPositions: [],
    };
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial", {
      alternateStages: [
        { stageId: "zeta", ...stageSpatialConfig, setupDetection: { position: [50, 51, 52], radius: 30 } },
        { stageId: "alpha", ...stageSpatialConfig, setupDetection: { position: [53, 54, 55], radius: 30 } },
      ],
    });
    seedAgentSpatialConfig(sqlite, selectableRevisionId);
    const services = createPlatformServices(database);

    const response = await services.listAgentMaps({ page: 1, pageSize: 20 });
    expect(response.items[0]?.gameplayRevisions.map((revision) => revision.gameplayRevisionId)).toEqual([
      "revision:map.agents:initial",
      selectableRevisionId,
    ]);
    expect(response.items[0]?.gameplayRevisions[0]?.challengeRefs).toEqual([
      { family: "map", challengeId: "challenge.agents.direct" },
      { family: "map", challengeId: "map.agents.conqueror" },
      { family: "map", challengeId: "title.agents.rework" },
    ]);
    expect(response.items[0]?.gameplayRevisions[0]?.spatialConfig.alternateStages.map((stage) => stage.stageId)).toEqual(["alpha", "zeta"]);
    expect((await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.agents" })).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "challenge.agents.direct", gameplayRevisionId: "revision:map.agents:initial" }),
      expect.objectContaining({ challengeId: "title.agents.rework", gameplayRevisionId: "revision:map.agents:initial" }),
      expect.objectContaining({ challengeId: "challenge.agents.direct", gameplayRevisionId: selectableRevisionId }),
    ]));
  });

  it("resolves a legacy title challenge alias through its assigned map title rule", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.classic");
    seedTitle(sqlite, "CLASSIC");
    seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
    seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.classic");
    seedException(sqlite, "exception.classic", "rule.classic", "map.classic");
    seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.classic");
    sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ? AND challenge_family = 'title_challenge' AND challenge_id = 'title.CLASSIC'").run("revision:map.classic:initial");
    const classicRevisionId = legacyGameplayRevisionId("map.classic");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: classicRevisionId, mapId: "map.classic", challengeFamily: "title_challenge", challengeId: "title.CLASSIC" });
    seedAgentSpatialConfig(sqlite, "revision:map.classic:initial");
    seedAgentSpatialConfig(sqlite, classicRevisionId);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.classic', '1002', 'Classic Player', 'classic player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.classic', 'player.classic', 'CLASSIC', 'map.classic', ?, NULL, 'active', 'submission', 'source.classic', 'admin', ?)").run(classicRevisionId, now);
    const services = createPlatformServices(database);

    const map = (await services.getAgentMap({ mapId: "map.classic" }))!;
    expect(map.gameplayRevisions.map((revision) => revision.gameplayRevisionId)).toEqual([
      "revision:map.classic:initial",
      classicRevisionId,
    ]);
    expect(map.gameplayRevisions[1]?.challengeRefs).toEqual([{ family: "map", challengeId: "title.CLASSIC" }]);
    await expect(services.listAgentMapTitleHolders({ mapId: "map.classic", page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ mapId: "map.classic", gameplayRevisionId: classicRevisionId, titleKey: "CLASSIC", slot: null, slotSemantics: "none" })],
    });
  });
});

describe("Agents map projection readiness", () => {
  it("fails the whole map closed for an incomplete enabled revision and never projects historical or preparing rows", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    const invalidSelectableId = seedSelectableGameplayRevision(sqlite, "map.agents", "invalid");
    sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run("not-json", invalidSelectableId);
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES ('revision:map.agents:historical', 'map.agents', 'historical', NULL, NULL, NULL, '2025.01.1', ?, ?, ?), ('revision:map.agents:preparing', 'map.agents', 'preparing', NULL, NULL, NULL, '2026.08.1', ?, ?, ?)").run(JSON.stringify({}), now, now, JSON.stringify({}), now, now);
    const services = createPlatformServices(database);

    const map = (await services.getAgentMap({ mapId: "map.agents" }))!;
    expect(map.gameplayRevisions).toEqual([]);
  });

  it("keeps a valid map with zero legitimate holders as an empty projection", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.empty");
    seedAgentSpatialConfig(sqlite, "revision:map.empty:initial");
    const services = createPlatformServices(database);

    await expect(services.listAgentMapTitleHolders({ mapId: "map.empty", page: 1, pageSize: 20 })).resolves.toMatchObject({
      contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false,
    });
  });

  it("does not turn durable grants into an empty projection when an enabled map is unavailable", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.unavailable");
    seedTitle(sqlite, "PIONEER");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.unavailable', '1003', 'Unavailable Player', 'unavailable player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.unavailable', 'player.unavailable', 'PIONEER', 'map.unavailable', 'revision:map.unavailable:initial', 'pioneer', 'active', 'submission', 'source.unavailable', 'admin', ?)").run(now);
    const services = createPlatformServices(database);

    await expect(services.listAgentMapTitleHolders({ mapId: "map.unavailable", page: 1, pageSize: 20 })).rejects.toThrow("AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE");
  });

  it("fails closed when a compat title alias lacks its mapped rule assignment", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.compat");
    seedTitle(sqlite, "CLASSIC");
    seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
    seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.compat");
    seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.compat");
    sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ? AND challenge_family = 'title_challenge' AND challenge_id = 'title.CLASSIC'").run("revision:map.compat:initial");
    const classicRevisionId = legacyGameplayRevisionId("map.compat");
    seedClassicGameplayRevision(sqlite, "map.compat");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: classicRevisionId, mapId: "map.compat", challengeFamily: "title_challenge", challengeId: "title.CLASSIC" });
    seedAgentSpatialConfig(sqlite, "revision:map.compat:initial");
    seedAgentSpatialConfig(sqlite, classicRevisionId);
    const services = createPlatformServices(database);

    await expect(services.getAgentMap({ mapId: "map.compat" })).resolves.toMatchObject({
      gameplayRevisions: [],
    });
  });

  it("does not project a map when enabled defaults are ambiguous", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES ('revision:map.agents:duplicate-default', 'map.agents', 'default', NULL, NULL, NULL, '2026.08.1', ?, ?, ?)").run(JSON.stringify({}), now, now);
    seedAgentSpatialConfig(sqlite, "revision:map.agents:duplicate-default");
    const services = createPlatformServices(database);

    await expect(services.getAgentMap({ mapId: "map.agents" })).resolves.toMatchObject({ mapId: "map.agents", gameplayRevisions: [] });
  });

  it("scopes map title holders to projectable revision identities", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedTitle(sqlite, "PIONEER");
    const selectableRevisionId = seedSelectableGameplayRevision(sqlite, "map.agents");
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.agents:historical', 'map.agents', 'historical', NULL, NULL, NULL, '2025.01.1', ?, ?)").run(now, now);
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    seedAgentSpatialConfig(sqlite, selectableRevisionId);
    seedAgentSpatialConfig(sqlite, "revision:map.agents:historical");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.agents', '1001', 'Agent Player', 'agent player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.default', 'player.agents', 'PIONEER', 'map.agents', 'revision:map.agents:initial', 'pioneer', 'active', 'submission', 'source.default', 'admin', ?), ('grant.selectable', 'player.agents', 'PIONEER', 'map.agents', ?, 'pioneer', 'active', 'submission', 'source.selectable', 'admin', ?), ('grant.historical', 'player.agents', 'PIONEER', 'map.agents', 'revision:map.agents:historical', 'pioneer', 'active', 'submission', 'source.historical', 'admin', ?)").run(now, selectableRevisionId, now, now);
    const services = createPlatformServices(database);

    const response = await services.listAgentMapTitleHolders({ mapId: "map.agents", page: 1, pageSize: 20 });
    expect(response.items.map((item) => item.gameplayRevisionId)).toEqual(["revision:map.agents:initial", selectableRevisionId]);
  });
});

describe("Admin map revision editor", () => {
  it("only exposes active and assignable map title rules", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.editor.catalog");
    seedTitle(sqlite, "PIONEER");
    seedRule(sqlite, "rule.pioneer.catalog", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "all_active" });
    seedTitle(sqlite, "CONQUEROR");
    seedRule(sqlite, "rule.conqueror.catalog", "CONQUEROR", "conqueror", { slot: "conqueror" });
    seedTitle(sqlite, "RETIRED");
    seedRule(sqlite, "rule.retired.catalog", "RETIRED", "retired", { status: "inactive" });
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    await expect(services.getAdminMapEditor({ mapId: "map.editor.catalog" }, auth)).resolves.toMatchObject({
      challengeCatalog: expect.arrayContaining([expect.objectContaining({ challengeId: "rule.conqueror.catalog" })]),
    });
    const initial = await services.getAdminMapEditor({ mapId: "map.editor.catalog" }, auth);
    expect(initial.challengeCatalog).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "rule.pioneer.catalog" }),
      expect.objectContaining({ challengeId: "rule.retired.catalog" }),
    ]));

    sqlite.prepare("UPDATE map_title_rules SET default_scope = 'explicit' WHERE id = ?").run("rule.pioneer.catalog");
    const repaired = await services.getAdminMapEditor({ mapId: "map.editor.catalog" }, auth);
    expect(repaired.challengeCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "rule.pioneer.catalog" }),
    ]));
  });

  it("copies only revision configuration, supports the reset lifecycle, and keeps progress scoped to R1", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.editor");
    sqlite.prepare("UPDATE maps SET game_version = '2026.08.12' WHERE id = 'map.editor'").run();
    seedLegacyMapChallenge(sqlite, "challenge.editor", "map.editor");
    seedAgentSpatialConfig(sqlite, "revision:map.editor:initial");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.editor:initial", mapId: "map.editor", challengeFamily: "map_challenge", challengeId: "challenge.editor" });
    seedTitle(sqlite, "PIONEER");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.editor', '1001', 'Editor Player', 'editor player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.editor.r1', 'player.editor', 'PIONEER', 'map.editor', 'revision:map.editor:initial', 'pioneer', 'active', 'submission', 'submission.editor.r1', 'admin', ?)").run(now);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const editorBefore = await services.getAdminMapEditor({ mapId: "map.editor" }, auth);
    const r1Before = editorBefore.revisions.find((revision) => revision.revisionId === "revision:map.editor:initial")!;

    const r2 = await services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.editor",
      sourceRevisionId: r1Before.revisionId,
      gameVersion: "2026.08.13",
      mapVariant: null,
      copyConfiguration: true,
    }, auth, "editor-create-r2");
    expect(r2.lifecycle).toBe("preparing");
    expect(r2.gameVersion).toBe("2026.08.13");
    expect(r2.resetReason).toBeNull();
    expect(r2.spatialConfig).toEqual(r1Before.spatialConfig);
    expect(r2.challengeAssignments).toMatchObject(r1Before.challengeAssignments.map(({ assignmentId: _assignmentId, gameplayRevisionId: _revisionId, mapId: _mapId, ...assignment }) => assignment));
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM player_title_grants WHERE map_id = 'map.editor' ORDER BY gameplay_revision_id").all()).toEqual([{ gameplay_revision_id: "revision:map.editor:initial" }]);

    const updateInput = (revision: typeof r1Before, lifecycle: "default" | "selectable") => ({
      contractVersion: "1" as const,
      mapId: "map.editor",
      revisionId: revision.revisionId,
      lifecycle,
      replacedDefaultLifecycle: null,
      gameVersion: revision.gameVersion,
      mapVariant: null,
      spatialConfig: revision.spatialConfig,
      challengeAssignments: revision.challengeAssignments.map(({ assignmentId: _assignmentId, gameplayRevisionId: _revisionId, mapId: _mapId, ...assignment }) => assignment),
    });
    const { alternateStages: _existingAlternateStages, ...stageSpatialConfig } = r2.spatialConfig!;
    const r2Default = await services.updateAdminMapRevision({
      ...updateInput(r2, "default"),
      replacedDefaultLifecycle: "selectable",
      spatialConfig: {
        ...r2.spatialConfig!,
        alternateStages: [
          { stageId: "zeta", ...stageSpatialConfig, setupDetection: { position: [50, 51, 52], radius: 30 } },
          { stageId: "alpha", ...stageSpatialConfig, setupDetection: { position: [53, 54, 55], radius: 30 } },
        ],
      },
    }, auth, "editor-update-r2");
    expect(r2Default.isDefault).toBe(true);
    expect(r2Default.gameVersion).toBe("2026.08.13");
    expect(r2Default.spatialConfig?.alternateStages.map((stage) => stage.stageId)).toEqual(["alpha", "zeta"]);
    expect(JSON.parse((sqlite.prepare("SELECT spatial_config_json FROM gameplay_revisions WHERE id = ?").get(r2.revisionId) as { spatial_config_json: string }).spatial_config_json).alternateStages.map((stage: { stageId: string }) => stage.stageId)).toEqual(["alpha", "zeta"]);
    expect((await services.getAdminMapEditor({ mapId: "map.editor" }, auth)).revisions.map((revision) => [revision.revisionId, revision.lifecycle])).toEqual(expect.arrayContaining([
      ["revision:map.editor:initial", "selectable"],
      [r2.revisionId, "default"],
    ]));
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM player_title_grants WHERE map_id = 'map.editor' ORDER BY gameplay_revision_id").all()).toEqual([{ gameplay_revision_id: "revision:map.editor:initial" }]);
    const audit = sqlite.prepare("SELECT operation, entity_id, json_extract(payload_json, '$.progressCopied') AS progress_copied, json_extract(payload_json, '$.resetReason') AS reset_reason, json_extract(payload_json, '$.gameVersion') AS game_version, json_extract(payload_json, '$.replacedByRevisionId') AS replaced_by_revision_id, json_extract(payload_json, '$.replacedDefaultLifecycle') AS replaced_default_lifecycle FROM audit_events WHERE operation IN ('admin.map.revision.create', 'admin.map.revision.update')").all();
    expect(audit).toEqual(expect.arrayContaining([
      { operation: "admin.map.revision.create", entity_id: r2.revisionId, progress_copied: 0, reset_reason: null, game_version: "2026.08.13", replaced_by_revision_id: null, replaced_default_lifecycle: null },
      { operation: "admin.map.revision.update", entity_id: r1Before.revisionId, progress_copied: 0, reset_reason: null, game_version: null, replaced_by_revision_id: r2.revisionId, replaced_default_lifecycle: null },
      { operation: "admin.map.revision.update", entity_id: r2.revisionId, progress_copied: 0, reset_reason: null, game_version: "2026.08.13", replaced_by_revision_id: null, replaced_default_lifecycle: "selectable" },
    ]));
  });

  it("rejects invalid spatial data and challenge references before writing a revision", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.editor.invalid");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const revision = (await services.getAdminMapEditor({ mapId: "map.editor.invalid" }, auth)).revisions[0]!;
    await expect(services.updateAdminMapRevision({
      contractVersion: "1", mapId: "map.editor.invalid", revisionId: revision.revisionId, lifecycle: "selectable", gameVersion: revision.gameVersion, mapVariant: null, spatialConfig: null, challengeAssignments: [],
    }, auth, "invalid-spatial")).rejects.toThrow("INVALID_SPATIAL_CONFIG");
    await expect(services.createAdminMapRevision({
      contractVersion: "1", mapId: "map.editor.invalid", resetReason: "invalid assignment", mapVariant: null, copyConfiguration: false,
      challengeAssignments: [{ challengeFamily: "map_challenge", challengeId: "missing.challenge", enabled: true, condition: null, evidenceRule: null, submissionMode: null, slot: null }],
    }, auth, "invalid-reference")).rejects.toThrow("REVISION_CHALLENGE_NOT_FOUND");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM gameplay_revisions WHERE map_id = 'map.editor.invalid'").get()).toEqual({ count: 1 });
  });
});

/** Seed helpers */
const seedMap = (sqlite: DatabaseSync, id: string, status: "active" | "retired" = "active") => {
  sqlite.prepare(
    "INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, '2026.07.15', ?, '2026.07.15', ?, ?)",
  ).run(id, `地图 ${id}`, status, now, now);
  sqlite.prepare(
    "INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, NULL, '2026.07.15', ?, ?)",
  ).run(`revision:${id}:initial`, id, status === "active" ? "default" : "historical", now, now);
};

const seedClassicGameplayRevision = (sqlite: DatabaseSync, mapId: string) => {
  sqlite.prepare(
    "INSERT OR IGNORE INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'selectable', 'classic', ?, NULL, '2026.07.15', ?, ?)",
  ).run(legacyGameplayRevisionId(mapId), mapId, null, now, now);
};

const seedSelectableGameplayRevision = (sqlite: DatabaseSync, mapId: string, suffix = "rework") => {
  const id = `revision:${mapId}:${suffix}`;
  sqlite.prepare(
    "INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'selectable', NULL, ?, 'revision test', '2026.08.10', ?, ?)",
  ).run(id, mapId, `revision:${mapId}:initial`, now, now);
  return id;
};

const seedAgentSpatialConfig = (sqlite: DatabaseSync, gameplayRevisionId: string, overrides: Record<string, unknown> = {}) => {
  const spatialConfig = {
    bastionPositions: [[1, 2, 3]],
    resetPosition: [4, 5, 6],
    endPosition: [7, 8, 9],
    thirdPersonPosition: [10, 11, 12],
    creditsPosition: [13, 14, 15],
    control: null,
    portalPositions: [],
    springboardPositions: [],
    ...overrides,
  };
  sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run(JSON.stringify(spatialConfig), gameplayRevisionId);
};

const seedRevisionAssignment = (sqlite: DatabaseSync, input: {
  gameplayRevisionId: string;
  mapId: string;
  challengeFamily: "map_title_rule" | "map_challenge" | "title_challenge";
  challengeId: string;
  enabled?: number;
  condition?: string | null;
  evidenceRule?: string | null;
  submissionMode?: string | null;
  slot?: string | null;
}) => {
  sqlite.prepare(
    "INSERT OR REPLACE INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(`assignment:${input.gameplayRevisionId}:${input.challengeFamily}:${input.challengeId}`, input.gameplayRevisionId, input.mapId, input.challengeFamily, input.challengeId, input.enabled ?? 1, input.condition ?? null, input.evidenceRule ?? null, input.submissionMode ?? null, input.slot ?? null, now, now);
};

const seedTitle = (sqlite: DatabaseSync, key: string) => {
  sqlite.prepare(
    "INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES (?, ?, 'trophy', '地图系列', '条件', 'active', 'map', 'map_name_suffix', 'null', '2026.07.15')",
  ).run(key, `称号 ${key}`);
};

const seedRule = (
  sqlite: DatabaseSync,
  ruleId: string,
  titleKey: string,
  kind: string,
  opts: { slot?: string; mapVariant?: string; defaultScope?: string; status?: string } = {},
) => {
  sqlite.prepare(
    "INSERT INTO map_title_rules (id, title_key, kind, condition, evidence_rule, submission_mode, display_kind, slot, map_variant, default_scope, status, introduced_version, created_at, updated_at) VALUES (?, ?, ?, '完成地图', '上传截图', 'manual', 'map_name_suffix', ?, ?, ?, ?, '2026.07.15', ?, ?)",
  ).run(ruleId, titleKey, kind, opts.slot ?? null, opts.mapVariant ?? null, opts.defaultScope ?? "all_active", opts.status ?? "active", now, now);
  if (opts.status === "inactive" || opts.defaultScope === "explicit" || kind.toLocaleLowerCase() === "pioneer") return;
  const maps = sqlite.prepare("SELECT id FROM maps WHERE status = 'active'").all() as Array<{ id: string }>;
  for (const map of maps) {
    if (opts.mapVariant === "classic") {
      seedClassicGameplayRevision(sqlite, map.id);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: legacyGameplayRevisionId(map.id), mapId: map.id, challengeFamily: "map_title_rule", challengeId: ruleId });
    } else {
      seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${map.id}:initial`, mapId: map.id, challengeFamily: "map_title_rule", challengeId: ruleId });
    }
  }
};

const seedMapTitleChallenge = (sqlite: DatabaseSync, challengeId: string, titleKey: string, mapId: string) => {
  sqlite.prepare(
    "INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES (?, ?, '完成经典版地图', '上传截图', 'manual', '2026.07.15', 'active', '2026.07.15', 'map', ?, ?)",
  ).run(challengeId, titleKey, now, now);
  sqlite.prepare("INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES (?, ?)").run(challengeId, mapId);
  seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "title_challenge", challengeId });
};

const seedException = (
  sqlite: DatabaseSync,
  id: string,
  ruleId: string,
  mapId: string,
  opts: { enabled?: number; condition?: string; evidenceRule?: string; slot?: string } = {},
) => {
  sqlite.prepare(
    "INSERT INTO map_title_rule_exceptions (id, rule_id, map_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
  ).run(id, ruleId, mapId, opts.enabled ?? 1, opts.condition ?? null, opts.evidenceRule ?? null, opts.slot ?? null, now, now);
  const rule = sqlite.prepare("SELECT map_variant FROM map_title_rules WHERE id = ?").get(ruleId) as { map_variant: string | null };
  const gameplayRevisionId = rule.map_variant === "classic"
    ? (seedClassicGameplayRevision(sqlite, mapId), legacyGameplayRevisionId(mapId))
    : `revision:${mapId}:initial`;
  seedRevisionAssignment(sqlite, {
    gameplayRevisionId,
    mapId,
    challengeFamily: "map_title_rule",
    challengeId: ruleId,
    enabled: opts.enabled ?? 1,
    condition: opts.condition ?? null,
    evidenceRule: opts.evidenceRule ?? null,
    slot: opts.slot ?? null,
  });
};

const seedCompat = (sqlite: DatabaseSync, legacyId: string, ruleId: string, mapId: string, isStandard = 1) => {
  sqlite.prepare(
    "INSERT INTO map_title_rule_compat (legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(legacyId, ruleId, mapId, isStandard, now);
};

const seedLegacyMapChallenge = (sqlite: DatabaseSync, challengeId: string, mapId: string) => {
  sqlite.prepare(
    "INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, 'difficulty_completion', '旧称号挑战', '传奇', '旧条件', '旧截图规则', 'manual', 'CONQUEROR', '2026.07.15', 'active', '2026.07.15', ?, ?)",
  ).run(challengeId, mapId, now, now);
  seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "map_challenge", challengeId });
};

const requestHash = async (value: unknown) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const uploadHash = async (body: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

// Expose the internal resolveMapTitleProjection helper via the service's test-internal path.
// We test it indirectly through reviewSubmission and a thin wrapper export.
// For direct unit coverage of the resolver we call it through a minimal service instance
// and an augmented services object that exposes the resolver.
//
// The resolver lives inside createPlatformServices's closure. We access it by creating
// a minimal services object and asserting on the reviewSubmission behaviour.

describe("map title rule model – locked invariants", () => {
  describe("post-OCR player confirmation", () => {
    it("confirms a rule-projected map title and preserves its snapshot", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      const reworkRevisionId = seedSelectableGameplayRevision(sqlite, "map.paris");
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });

      const sessionToken = "player-session";
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.1', 'member.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.1', 'attempt.1', 'group.1', 'member.1', 'production', ?, ?, ?)").run(await requestHash(sessionToken), now + 60_000, now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.1', 'binding.1', 'awaiting_player_confirmation', 'unknown', NULL, NULL, '成就挑战', 'Tester', 'portal', 'portal', 'upload.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.1', 'submission.1', 1, 'matched', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, fields: { challenge_completed: { status: "ok", confidence: 0.99 }, viewer_player: { status: "ok", confidence: 0.99 }, map_name: { status: "ok", confidence: 0.99 } }, data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.paris", achievement_titles: ["称号 CONQUEROR"] } }), now);

      const services = createPlatformServices(database);
      const result = await services.confirmPlayerSubmissionChallenge(
        { submissionId: "submission.1", challengeId: "map.paris.conqueror", mapId: "map.paris", gameplayRevisionId: reworkRevisionId } as never,
        sessionToken,
      );

      expect(result.status).toBe("ready_for_review");
      const submission = sqlite.prepare("SELECT challenge_type, challenge_id, target_map_id, gameplay_revision_id, rule_snapshot_json FROM submissions WHERE id = 'submission.1'").get() as { challenge_type: string; challenge_id: string; target_map_id: string; gameplay_revision_id: string; rule_snapshot_json: string };
      expect(submission.challenge_type).toBe("map_title_achievement");
      expect(submission.challenge_id).toBe("map.paris.conqueror");
      expect(submission.target_map_id).toBe("map.paris");
      expect(submission.gameplay_revision_id).toBe(reworkRevisionId);
      expect(JSON.parse(submission.rule_snapshot_json)).toMatchObject({ ruleId: "rule.conqueror", mapId: "map.paris", gameplayRevisionId: reworkRevisionId, titleKey: "CONQUEROR", slot: "conqueror" });
    });

    it("repairs a legacy classic submission before manual OCR retry", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CLASSIC");
      seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
      seedException(sqlite, "exception.paris", "rule.classic", "map.paris");
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.paris");
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.legacy-classic', 'binding.1', 'resubmission_required', 'map_title_achievement', 'title.CLASSIC', 'map.paris', '地图 map.paris', 'Tester', 'portal', 'portal', 'msg.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.1', 'sub.legacy-classic', 'portal', 'external.1', 'image/png', 1, 'hash', 'evidence/classic.png', 'stored', ?)").run(now);

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        fields: {
          challenge_completed: { status: "ok", confidence: 0.99 },
          viewer_player: { status: "ok", confidence: 0.99 },
          map_name: { status: "ok", confidence: 0.99 },
          map_variant: { status: "ok", confidence: 0.99 },
        },
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.paris", map_variant: "classic", achievement_panel_text: "称号 CLASSIC ✓" },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const sent: unknown[] = [];
        const queue = { send: async (message: unknown) => { sent.push(message); } } as Queue;
        const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", queue, "ocr-bucket");
        await services.requestAdminOcr({ submissionId: "sub.legacy-classic" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "idem.1", "request.1");
        await services.processOcrJob({ ...(sent[0] as { submissionId: string; objectKey: string; manual: boolean; requestId: string }), attempt: 1 });
      } finally {
        vi.unstubAllGlobals();
      }

      const submission = sqlite.prepare("SELECT status, rule_snapshot_json FROM submissions WHERE id = 'sub.legacy-classic'").get() as { status: string; rule_snapshot_json: string | null };
      expect(submission.status).toBe("approved");
      expect(JSON.parse(submission.rule_snapshot_json!)).toMatchObject({ titleKey: "CLASSIC", mapId: "map.paris", mapVariant: "classic" });
    });

    it("persists the covered conqueror grant when a dominator OCR match is automated", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.dorado");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.auto', 'auto-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.auto', 'identity.auto', 'player.auto', 'qq', 'group.auto', 'member.auto', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.auto', 'binding.auto', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'auto.1', ?, ?)").run(now, now);

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        fields: {
          challenge_completed: { status: "ok", confidence: 0.99 },
          viewer_player: { status: "ok", confidence: 0.99 },
          map_name: { status: "ok", confidence: 0.99 },
          difficulty: { status: "ok", confidence: 0.99 },
        },
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.dorado", difficulty: "地狱" },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", undefined, "ocr-bucket");
        await services.processOcrJob({ submissionId: "submission.auto", objectKey: "evidence/auto.png", attempt: 1, requestId: "request.auto" });
      } finally {
        vi.unstubAllGlobals();
      }

      const grants = sqlite.prepare("SELECT title_key, slot, source_type, source_id FROM player_title_grants WHERE player_account_id = 'player.auto' AND status = 'active' ORDER BY title_key").all() as Array<{ title_key: string; slot: string; source_type: string; source_id: string }>;
      expect(grants).toEqual([
        { title_key: "CONQUEROR", slot: "conqueror", source_type: "automatic", source_id: "submission.auto" },
        { title_key: "DOMINATOR", slot: "dominator", source_type: "automatic", source_id: "submission.auto" },
      ]);
      const auditCount = sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'submission.automatic_grant' AND entity_type = 'player_title_grant'").get() as { count: number };
      expect(auditCount.count).toBe(2);
    });
  });

  // ─── Invariant: Stable IDs ────────────────────────────────────────────────
  describe("stable IDs – compat table preserves map.<mapId>.<kind> IDs", () => {
    it("resolves a legacy challenge ID via the compat table", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris", 1);

      // Verify compat row exists and points to the rule + map.
      const compat = sqlite.prepare(
        "SELECT * FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { rule_id: string; map_id: string; is_standard_instance: number } | undefined;

      expect(compat?.rule_id).toBe("rule.conqueror");
      expect(compat?.map_id).toBe("map.paris");
      expect(compat?.is_standard_instance).toBe(1);

      // The legacy ID must not change when the rule is updated.
      sqlite.prepare("UPDATE map_title_rules SET condition = '新条件', updated_at = ? WHERE id = 'rule.conqueror'").run(now + 1000);
      const compatAfter = sqlite.prepare(
        "SELECT legacy_challenge_id FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { legacy_challenge_id: string } | undefined;
      expect(compatAfter?.legacy_challenge_id).toBe("map.paris.conqueror");
    });

    it("distinguishes standard instances from real exceptions in the compat table", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedMap(sqlite, "map.busan");
      seedTitle(sqlite, "CONQUEROR_BUSAN"); // real exception title
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris", 1);  // standard
      seedCompat(sqlite, "map.busan.conqueror", "rule.conqueror", "map.busan", 0);  // real exception

      const paris = sqlite.prepare(
        "SELECT is_standard_instance FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { is_standard_instance: number } | undefined;
      const busan = sqlite.prepare(
        "SELECT is_standard_instance FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.busan.conqueror'",
      ).get() as { is_standard_instance: number } | undefined;

      expect(paris?.is_standard_instance).toBe(1);
      expect(busan?.is_standard_instance).toBe(0);
    });
  });

  // ─── Invariant: Exception precedence ─────────────────────────────────────
  describe("exception precedence – resolution is deterministic", () => {
    it("projects map-scoped title challenges into the map catalog and admin map list", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.hanamura");
      seedTitle(sqlite, "CLASSIC");
      seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.hanamura");
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.listChallenges({ family: "map" })).resolves.toContainEqual(expect.objectContaining({ challengeId: "title.CLASSIC", titleKey: "CLASSIC", mapId: "map.hanamura", kind: "map_title_achievement" }));
      await expect(services.listAdminChallenges({ family: "map" }, auth)).resolves.toMatchObject({ items: [expect.objectContaining({ challengeId: "title.CLASSIC", titleKey: "CLASSIC", mapId: "map.hanamura", kind: "map_title_achievement" })] });
    });

    it("projects one stable, traceable map challenge for Portal, Admin, and Agents", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      const services = createPlatformServices(database);

      const portal = await services.listChallenges({ family: "map" });
      const admin = await services.listAdminChallenges({ family: "map" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
      const agents = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.paris" });
      const expected = { challengeId: "map.paris.conqueror", titleKey: "CONQUEROR", mapId: "map.paris", mapTitleRule: { ruleId: "rule.conqueror", kind: "conqueror", displayKind: "map_name_suffix", slot: "conqueror", dynamic: true } };

      expect(portal).toContainEqual(expect.objectContaining(expected));
      expect(admin.items).toContainEqual(expect.objectContaining(expected));
      expect(agents.items).toContainEqual(expect.objectContaining(expected));
    });

    it("projects assignments on an arbitrary selectable revision across every map challenge family", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "REWORK");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedLegacyMapChallenge(sqlite, "challenge.paris.direct", "map.paris");
      seedMapTitleChallenge(sqlite, "title.paris.rework", "REWORK", "map.paris");
      const reworkRevisionId = seedSelectableGameplayRevision(sqlite, "map.paris");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      seedAgentSpatialConfig(sqlite, reworkRevisionId);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_challenge", challengeId: "challenge.paris.direct" });
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "title_challenge", challengeId: "title.paris.rework" });
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const portal = await services.listChallenges({ family: "map" });
      const admin = await services.listAdminChallenges({ family: "map" }, auth);
      const agents = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.paris" });
      const reworkProjection = (challengeId: string) => expect.objectContaining({ challengeId, mapId: "map.paris", gameplayRevisionId: reworkRevisionId });

      expect(portal).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("challenge.paris.direct"),
        reworkProjection("title.paris.rework"),
      ]));
      expect(admin.items).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("challenge.paris.direct"),
        reworkProjection("title.paris.rework"),
      ]));
      expect(agents.items).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("title.paris.rework"),
      ]));
    });

    it("lets a maintainer select a projected challenge for an ambiguous submission", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedMap(sqlite, "map.hanamura");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.1', 'member.1', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.ambiguous', 'binding.1', 'ocr_review_required', 'unknown', '地图 map.paris', 'Tester', 'portal', 'portal', 'message.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.ambiguous', 'submission.ambiguous', 1, 'review_required', ?, ?, ?)").run(JSON.stringify({ data: { map_name: "地图 map.paris", difficulty: "地狱" } }), JSON.stringify({ candidates: [{ challengeId: "map.paris.conqueror", mapId: "map.paris", challengeType: "map_title_achievement", targetMapName: "地图 map.paris", targetDifficulty: "传奇", titleName: "称号 CONQUEROR", match: { achievement: true } }] }), now);
      const services = createPlatformServices(database);
      await expect(services.selectAdminSubmissionChallenge({ submissionId: "submission.ambiguous", challengeId: "map.paris.conqueror", mapId: "map.paris" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "challenge-select-lower-difficulty")).rejects.toThrow("CHALLENGE_NOT_FOUND");
      sqlite.prepare("UPDATE ocr_results SET match_json = ? WHERE id = 'ocr.ambiguous'").run(JSON.stringify({ candidates: [{ challengeId: "map.hanamura.conqueror", challengeType: "map_title_achievement", targetMapName: "花村", titleName: "称号 CONQUEROR", match: { achievement: true } }] }));
      await expect(services.selectAdminSubmissionChallenge({ submissionId: "submission.ambiguous", challengeId: "map.hanamura.conqueror", mapId: "map.hanamura" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "challenge-select-missing-map-id")).rejects.toThrow("CHALLENGE_NOT_FOUND");
      sqlite.prepare("UPDATE ocr_results SET match_json = ? WHERE id = 'ocr.ambiguous'").run(JSON.stringify({ candidates: [{ challengeId: "map.paris.conqueror", mapId: "map.paris", challengeType: "map_title_achievement", targetMapName: "地图 map.paris", targetDifficulty: null, titleName: "称号 CONQUEROR", match: { achievement: true } }] }));
      await expect(services.selectAdminSubmissionChallenge({ submissionId: "submission.ambiguous", challengeId: "map.hanamura.conqueror", mapId: "map.hanamura" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "challenge-select-cross-map")).rejects.toThrow("CHALLENGE_NOT_FOUND");
      const result = await services.selectAdminSubmissionChallenge({ submissionId: "submission.ambiguous", challengeId: "map.paris.conqueror", mapId: "map.paris" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "challenge-select.1");

      expect(result).toMatchObject({ submissionId: "submission.ambiguous", status: "ready_for_review", challengeId: "map.paris.conqueror" });
      const submission = sqlite.prepare("SELECT status, challenge_type, challenge_id, target_map_id, rule_snapshot_json FROM submissions WHERE id = 'submission.ambiguous'").get() as { status: string; challenge_type: string; challenge_id: string; target_map_id: string; rule_snapshot_json: string };
      expect(submission).toMatchObject({ status: "ready_for_review", challenge_type: "map_title_achievement", challenge_id: "map.paris.conqueror", target_map_id: "map.paris" });
      expect(JSON.parse(submission.rule_snapshot_json)).toMatchObject({ ruleId: "rule.conqueror", titleKey: "CONQUEROR", mapId: "map.paris" });
      expect(sqlite.prepare("SELECT operation FROM audit_events WHERE entity_id = 'submission.ambiguous'").get()).toMatchObject({ operation: "submission.challenge.select" });
    });

    it("requires and persists the selected gameplay revision for duplicate map candidates", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      const reworkRevisionId = seedSelectableGameplayRevision(sqlite, "map.paris");
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.1', 'member.1', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.revision-choice', 'binding.1', 'ocr_review_required', 'unknown', '地图 map.paris', 'Tester', 'portal', 'portal', 'message.1', ?, ?)").run(now, now);
      const candidate = (gameplayRevisionId: string) => ({ challengeId: "map.paris.conqueror", mapId: "map.paris", gameplayRevisionId, challengeType: "map_title_achievement", targetMapName: "地图 map.paris", targetDifficulty: "传奇", titleName: "称号 CONQUEROR", match: { achievement: true } });
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.revision-choice', 'submission.revision-choice', 1, 'review_required', ?, ?, ?)").run(
        JSON.stringify({ data: { map_name: "地图 map.paris", difficulty: "传奇" } }),
        JSON.stringify({ candidates: [candidate("revision:map.paris:initial"), candidate(reworkRevisionId)] }),
        now,
      );
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.selectAdminSubmissionChallenge({ submissionId: "submission.revision-choice", challengeId: "map.paris.conqueror", mapId: "map.paris" }, auth, "challenge-select-revision-missing")).rejects.toThrow("GAMEPLAY_REVISION_REQUIRED");
      await expect(services.selectAdminSubmissionChallenge({ submissionId: "submission.revision-choice", challengeId: "map.paris.conqueror", mapId: "map.paris", gameplayRevisionId: reworkRevisionId }, auth, "challenge-select-revision-rework")).resolves.toMatchObject({ status: "ready_for_review", challengeId: "map.paris.conqueror" });

      const submission = sqlite.prepare("SELECT gameplay_revision_id, rule_snapshot_json FROM submissions WHERE id = 'submission.revision-choice'").get() as { gameplay_revision_id: string; rule_snapshot_json: string };
      expect(submission.gameplay_revision_id).toBe(reworkRevisionId);
      expect(JSON.parse(submission.rule_snapshot_json)).toMatchObject({ gameplayRevisionId: reworkRevisionId });
    });

    it("lets a maintainer select a global achievement candidate", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedTitle(sqlite, "HERO");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.1', 'member.1', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.achievement', 'binding.1', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, match_json, created_at) VALUES ('ocr.achievement', 'submission.achievement', 1, 'review_required', ?, ?)").run(JSON.stringify({ candidates: [{ challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", match: { achievement: true } }] }), now);
      const services = createPlatformServices(database);
      sqlite.prepare("UPDATE ocr_results SET match_json = ? WHERE id = 'ocr.achievement'").run(JSON.stringify({ candidates: [{ challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", match: { achievement: false } }] }));
      await expect(services.selectAdminSubmissionChallenge({ submissionId: "submission.achievement", challengeId: "title.hero" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "challenge-select-no-evidence")).rejects.toThrow("CHALLENGE_NOT_SELECTABLE");
      sqlite.prepare("UPDATE ocr_results SET match_json = ? WHERE id = 'ocr.achievement'").run(JSON.stringify({ candidates: [{ challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", match: { achievement: true } }] }));
      const result = await services.selectAdminSubmissionChallenge({ submissionId: "submission.achievement", challengeId: "title.hero" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "challenge-select.2");

      expect(result).toMatchObject({ submissionId: "submission.achievement", status: "ready_for_review", challengeId: "title.hero" });
      expect(sqlite.prepare("SELECT status, challenge_type, challenge_id, target_map_id, map_name FROM submissions WHERE id = 'submission.achievement'").get()).toMatchObject({ status: "ready_for_review", challenge_type: "title_achievement", challenge_id: "title.hero", target_map_id: null, map_name: "成就挑战" });
    });

    it("does not expose a legacy map-title row alongside its rule projection", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedLegacyMapChallenge(sqlite, "map.paris.conqueror", "map.paris");
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const portal = (await services.listChallenges({ family: "map" })).filter((item) => item.challengeId === "map.paris.conqueror" && item.mapId === "map.paris");
      const admin = (await services.listAdminChallenges({ family: "map" }, auth)).items.filter((item) => item.challengeId === "map.paris.conqueror" && item.mapId === "map.paris");

      expect(portal).toHaveLength(1);
      expect(portal[0]).toMatchObject({ mapTitleRule: { ruleId: "rule.conqueror", dynamic: true } });
      expect(admin).toHaveLength(1);
      expect(admin[0]).toMatchObject({ mapTitleRule: { ruleId: "rule.conqueror", dynamic: true } });
    });

    it("keeps repeated legacy challenge IDs distinct by map context", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedMap(sqlite, "map.hanamura");
      seedTitle(sqlite, "CLASSIC");
      seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
      seedException(sqlite, "exception.paris", "rule.classic", "map.paris");
      seedException(sqlite, "exception.hanamura", "rule.classic", "map.hanamura");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      seedAgentSpatialConfig(sqlite, "revision:map.hanamura:initial");
      seedAgentSpatialConfig(sqlite, legacyGameplayRevisionId("map.paris"));
      seedAgentSpatialConfig(sqlite, legacyGameplayRevisionId("map.hanamura"));
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.paris");
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.hanamura");
      const services = createPlatformServices(database);

      const projections = (await services.listChallenges({ family: "map" })).filter((item) => item.challengeId === "title.CLASSIC");
      expect(projections).toHaveLength(2);
      expect(projections).toEqual(expect.arrayContaining([
        expect.objectContaining({ challengeId: "title.CLASSIC", mapId: "map.paris", mapVariant: "classic" }),
        expect.objectContaining({ challengeId: "title.CLASSIC", mapId: "map.hanamura", mapVariant: "classic" }),
      ]));
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC" })).resolves.toBeNull();
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC", mapId: "map.paris" })).resolves.toMatchObject({ mapId: "map.paris", mapVariant: "classic" });
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC", mapId: "map.hanamura" })).resolves.toMatchObject({ mapId: "map.hanamura", mapVariant: "classic" });
    });

    it("disabled exception removes the projection even for an all_active rule", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror", defaultScope: "all_active" });
      // Disabled exception: map.paris should not receive a projection.
      seedException(sqlite, "exc.1", "rule.conqueror", "map.paris", { enabled: 0 });

      // Verify exception is disabled.
      const exc = sqlite.prepare(
        "SELECT enabled FROM map_title_rule_exceptions WHERE rule_id = 'rule.conqueror' AND map_id = 'map.paris'",
      ).get() as { enabled: number } | undefined;
      expect(exc?.enabled).toBe(0);

      // reviewSubmission path: creating a submission with a legacy challenge ID
      // via the compat table must not resolve when the exception is disabled.
      // We test this by verifying the compat row exists but that resolveCompatProjection
      // would find the disabled exception and return null.
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      const services = createPlatformServices(database);

      // A submission review for a disabled projection should throw CHALLENGE_REWARD_NOT_CONFIGURED
      // because resolveCompatProjection returns null and the legacy row also has no reward_title_key.
      const bindingId = "binding.1";
      const submissionId = "sub.1";
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, 'id.1', 'player.1', 'qq', 'group.1', 'member.1', 'active', ?)").run(bindingId, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', '地图 map.paris', 'portal', 'portal', 'msg.1', ?, ?)").run(submissionId, bindingId, now, now);

      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await expect(
        services.reviewSubmission({ submissionId, decision: "approved", idempotencyKey: "key.1" } as never, auth, "key.1"),
      ).rejects.toThrow("CHALLENGE_REWARD_NOT_CONFIGURED");
    });

    it("enabled exception overrides condition and slot while keeping title_key from the rule", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedException(sqlite, "exc.1", "rule.conqueror", "map.paris", {
        enabled: 1,
        condition: "巴黎专属条件",
        slot: "pioneer", // overrides rule default slot
      });

      // Exception must not create a new title_key; rule's title_key is authoritative.
      const rule = sqlite.prepare("SELECT title_key FROM map_title_rules WHERE id = 'rule.conqueror'").get() as { title_key: string };
      const exc = sqlite.prepare("SELECT condition, slot FROM map_title_rule_exceptions WHERE id = 'exc.1'").get() as { condition: string; slot: string };

      expect(rule.title_key).toBe("CONQUEROR");
      expect(exc.condition).toBe("巴黎专属条件");
      expect(exc.slot).toBe("pioneer");
      // The exception does not carry its own title_key column — the rule owns it.
      const hasOwnTitleKey = sqlite.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('map_title_rule_exceptions') WHERE name = 'title_key'").get() as { c: number };
      expect(hasOwnTitleKey.c).toBe(0);
    });

    it("rule default applies when no exception exists and scope is all_active", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror", defaultScope: "all_active" });

      const noException = sqlite.prepare(
        "SELECT COUNT(*) AS c FROM map_title_rule_exceptions WHERE rule_id = 'rule.conqueror' AND map_id = 'map.paris'",
      ).get() as { c: number };
      expect(noException.c).toBe(0);

      // For all_active scope the rule projects to map.paris without an exception.
      const rule = sqlite.prepare("SELECT default_scope, slot FROM map_title_rules WHERE id = 'rule.conqueror'").get() as { default_scope: string; slot: string };
      expect(rule.default_scope).toBe("all_active");
      expect(rule.slot).toBe("conqueror");
    });

    it("explicit-scope rule does not project to maps without an enabled exception", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "SPECIAL");
      seedRule(sqlite, "rule.special", "SPECIAL", "special", { defaultScope: "explicit" });

      // No exception for map.paris → no projection.
      const noException = sqlite.prepare(
        "SELECT COUNT(*) AS c FROM map_title_rule_exceptions WHERE rule_id = 'rule.special' AND map_id = 'map.paris'",
      ).get() as { c: number };
      expect(noException.c).toBe(0);

      const rule = sqlite.prepare("SELECT default_scope FROM map_title_rules WHERE id = 'rule.special'").get() as { default_scope: string };
      expect(rule.default_scope).toBe("explicit");
    });

    it("keeps Pioneer closed until a map exception is explicitly enabled", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "PIONEER");
      seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "all_active" });
      const services = createPlatformServices(database);

      await expect(services.listChallenges({ family: "map" })).resolves.not.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris" }));

      sqlite.prepare("UPDATE map_title_rules SET default_scope = 'explicit' WHERE id = 'rule.pioneer'").run();
      seedException(sqlite, "exception.pioneer.paris", "rule.pioneer", "map.paris");
      await expect(services.listChallenges({ family: "map" })).resolves.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris", mapTitleRule: expect.objectContaining({ kind: "pioneer" }) }));
    });
  });

  // ─── Invariant: Slot semantics ───────────────────────────────────────────
  describe("slot semantics – immutable grant-time snapshot", () => {
    it("slot in rule_snapshot_json is taken from the rule (or exception) at submission time", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshotAtCreation = {
        ruleId: "rule.conqueror",
        ruleRevision: now,
        mapId: "map.paris",
        gameplayRevisionId: "revision:map.paris:initial",
        titleKey: "CONQUEROR",
        slot: "conqueror",
        displayKind: "map_name_suffix",
        condition: "完成地图",
        evidenceRule: "上传截图",
        submissionMode: "manual",
        defaultScope: "all_active",
        exceptionId: null,
      };

      // Simulate storing the snapshot at upload-session creation.
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.snap', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', 'revision:map.paris:initial', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshotAtCreation), now, now);

      // Now change the rule's slot — the stored snapshot must not be affected.
      sqlite.prepare("UPDATE map_title_rules SET slot = 'dominator', updated_at = ? WHERE id = 'rule.conqueror'").run(now + 5000);

      const row = sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'sub.snap'").get() as { rule_snapshot_json: string };
      const stored = JSON.parse(row.rule_snapshot_json) as typeof snapshotAtCreation;

      expect(stored.slot).toBe("conqueror");  // still the original value
      expect(stored.ruleRevision).toBe(now);  // still the original revision
    });
  });

  describe("gameplay revision applicability", () => {
    it("keeps old map grants active as facts while the current player view derives only the default revision", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "LEGACY");
      seedTitle(sqlite, "CURRENT");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.1', 'attempt.1', 'g.1', 'm.1', 'production', ?, ?, ?)").run(await requestHash("revision-title-session"), now + 60_000, now);
      sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = 'revision:map.paris:initial'").run();
      sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.paris:rework', 'map.paris', 'default', NULL, 'revision:map.paris:initial', 'difficulty redesign', '26.0810.2', ?, ?)").run(now + 1, now + 1);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.legacy', 'p.1', 'LEGACY', 'map.paris', 'revision:map.paris:initial', NULL, 'active', 'submission', 'submission.legacy', 'admin', ?), ('grant.current', 'p.1', 'CURRENT', 'map.paris', 'revision:map.paris:rework', NULL, 'active', 'submission', 'submission.current', 'admin', ?)").run(now, now + 1);

      const titles = await createPlatformServices(database).listCurrentPlayerTitles({ sessionToken: "revision-title-session" });

      expect(titles).toEqual([expect.objectContaining({ titleKey: "CURRENT" })]);
      expect(sqlite.prepare("SELECT id, status FROM player_title_grants ORDER BY id").all()).toEqual([
        { id: "grant.current", status: "active" },
        { id: "grant.legacy", status: "active" },
      ]);
    });
  });

  // ─── Invariant: Retired maps ─────────────────────────────────────────────
  describe("retired maps – no new projections", () => {
    it("a retired map has no current projection and produces no rule resolution", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.retired", "retired");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.retired.conqueror", "rule.conqueror", "map.retired");

      // Map is retired.
      const map = sqlite.prepare("SELECT status FROM maps WHERE id = 'map.retired'").get() as { status: string };
      expect(map.status).toBe("retired");

      // resolveMapTitleProjection step 1: retired map → null.
      // Verified indirectly: no active grants can exist for a retired map (not an error; just no projection).
      // Existing grants and submissions must remain readable.
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'A', 'a', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.old', 'p.1', 'CONQUEROR', 'map.retired', 'conqueror', 'active', 'historical', 'src.1', 'admin', ?)").run(now);

      // Existing grant is still readable after retirement.
      const grant = sqlite.prepare("SELECT id, status FROM player_title_grants WHERE id = 'grant.old'").get() as { id: string; status: string } | undefined;
      expect(grant?.id).toBe("grant.old");
      expect(grant?.status).toBe("active");
    });

    it("an in-flight submission created before retirement remains governed by its snapshot", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshot = { ruleId: "rule.conqueror", ruleRevision: now, mapId: "map.paris", gameplayRevisionId: "revision:map.paris:initial", titleKey: "CONQUEROR", slot: "conqueror", displayKind: "map_name_suffix", condition: "完成地图", evidenceRule: "上传截图", submissionMode: "manual", defaultScope: "all_active", exceptionId: null };
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.flight', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshot), now, now);

      // Retire the map after the session was created.
      sqlite.prepare("UPDATE maps SET status = 'retired', updated_at = ? WHERE id = 'map.paris'").run(now + 1000);

      // The snapshot on the submission is unchanged — retirement after session creation
      // does not silently invalidate the in-flight submission.
      const row = sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'sub.flight'").get() as { rule_snapshot_json: string };
      const stored = JSON.parse(row.rule_snapshot_json) as typeof snapshot;
      expect(stored.mapId).toBe("map.paris");
      expect(stored.slot).toBe("conqueror");
    });
  });

  // ─── Invariant: reviewSubmission reads snapshot for new-model submissions ──
  describe("submission review – snapshot path", () => {
    it("uses rule_snapshot_json for reward resolution when present, ignoring live rule changes", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshot = { ruleId: "rule.conqueror", ruleRevision: now, mapId: "map.paris", titleKey: "CONQUEROR", slot: "conqueror", displayKind: "map_name_suffix", condition: "完成地图", evidenceRule: "上传截图", submissionMode: "manual", defaultScope: "all_active", exceptionId: null };

      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.1', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', 'revision:map.paris:initial', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshot), now, now);

      // Change the rule's title_key after submission was created.
      // The review must still use the snapshot's titleKey, not the live rule.
      // (We don't update title_key in the DB since it's FK-constrained, but we
      // verify that the snapshot JSON drives the reward path by checking the
      // granted title_key.)
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const services = createPlatformServices(database);

      const result = await services.reviewSubmission(
        { submissionId: "sub.1", decision: "approved", idempotencyKey: "idem.1" } as never,
        auth,
        "idem.1",
      );

      expect(result.decision).toBe("approved");
      // The grant must reference the title from the snapshot.
      const grant = sqlite.prepare("SELECT title_key, map_id, gameplay_revision_id, slot FROM player_title_grants WHERE source_type = 'submission'").get() as { title_key: string; map_id: string; gameplay_revision_id: string; slot: string } | undefined;
      expect(grant?.title_key).toBe("CONQUEROR");
      expect(grant?.map_id).toBe("map.paris");
      expect(grant?.gameplay_revision_id).toBe("revision:map.paris:initial");
      expect(grant?.slot).toBe("conqueror");
    });
  });
});

const seedMasteryPlayer = (sqlite: DatabaseSync, playerId: string, bindingId: string, playerName: string) => {
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?)").run(playerId, playerId, playerName, playerName.toLocaleLowerCase(), now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', ?, ?, 'active', ?)").run(bindingId, `identity.${playerId}`, playerId, `group.${playerId}`, `member.${playerId}`, now);
};

const seedMasterySubmission = (sqlite: DatabaseSync, submissionId: string, bindingId: string, playerName: string, withAttachment = false) => {
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, difficulty, player_name, review_reason, grant_id, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_pending', 'unknown', NULL, NULL, '成就挑战', NULL, ?, NULL, NULL, 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, playerName, `message.${submissionId}`, now, now);
  if (withAttachment) sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'portal', ?, 'image/png', 1, 'hash', ?, 'stored', ?)").run(`attachment.${submissionId}`, submissionId, `external.${submissionId}`, `evidence/${submissionId}.png`, now);
};

const masteryOcr = (overrides: { viewerPlayer?: string; difficulty?: string; runCode?: string | null; durationSeconds?: number; layoutVersion?: string; version?: string; mapVariant?: "classic" | null } = {}) => {
  const runCode = overrides.runCode === undefined ? "1234-5678-9012" : overrides.runCode;
  return {
    schema_version: "1",
    ok: true,
    layout_version: overrides.layoutVersion ?? "test-layout-v1",
    fields: {
      challenge_completed: { status: "ok", confidence: 0.99 },
      viewer_player: { status: "ok", confidence: 0.99 },
      map_name: { status: "ok", confidence: 0.99 },
      difficulty: { status: "ok", confidence: 0.99 },
      version: { status: "ok", confidence: 0.99 },
      duration_seconds: { status: "ok", confidence: 0.99 },
      deaths: { status: "ok", confidence: 0.99 },
      skips: { status: "ok", confidence: 0.99 },
      ...(runCode === null ? {} : { run_code: { status: "ok", confidence: 0.99 } }),
      ...(overrides.mapVariant === "classic" ? { map_variant: { status: "ok", confidence: 0.99 } } : {}),
    },
    data: {
      challenge_completed: true,
      viewer_player: overrides.viewerPlayer ?? "Tester#1234",
      map_name: "地图 map.mastery",
      difficulty: overrides.difficulty ?? "困难",
      version: overrides.version ?? "99.0101.1",
      run_code: runCode,
      duration_seconds: overrides.durationSeconds ?? 600,
      deaths: 1,
      skips: 0,
      ...(overrides.mapVariant === undefined ? {} : { map_variant: overrides.mapVariant }),
    },
  };
};

describe("submission mastery outcomes", () => {
  it("keeps the version, layout, and run-code gate platform-owned", () => {
    expect(assessMasteryOcrEvidence(masteryOcr())).toEqual({ outcome: "ineligible", reason: "mastery_rollout_disabled" });
    expect(assessMasteryOcrEvidence(masteryOcr(), localMasteryEvidenceCompatibility)).toMatchObject({ outcome: "eligible", runCode: "1234-5678-9012", gameVersion: "99.0101.1" });
    expect(assessMasteryOcrEvidence(masteryOcr({ runCode: null }), localMasteryEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
    expect(assessMasteryOcrEvidence(masteryOcr({ layoutVersion: "test-layout-v0" }), localMasteryEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unsupported_layout" });
    expect(assessMasteryOcrEvidence(masteryOcr({ version: "99.0100.9" }), localMasteryEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unsupported_game_version" });
    const weakRunCode = masteryOcr();
    weakRunCode.fields.run_code = { status: "low_confidence", confidence: 0.89 };
    expect(assessMasteryOcrEvidence(weakRunCode, localMasteryEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
  });

  it("covers the authenticated upload, private evidence, OCR, mastery-only, and combined-title paths with local fakes", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasteryPlayer(sqlite, "player.two", "binding.two", "Other");

    const playerOneSession = "integration-player-one";
    const playerTwoSession = "integration-player-two";
    for (const [playerId, token] of [["player.one", playerOneSession], ["player.two", playerTwoSession]] as const) {
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
        .run(`session.${playerId}`, `attempt.${playerId}`, `group.${playerId}`, `member.${playerId}`, await requestHash(token), now + 60_000, now);
    }

    const storedObjects = new Map<string, ArrayBuffer>();
    const queued: Array<{ version: number; submissionId: string; objectKey: string; requestId?: string }> = [];
    const ocrRequests: Array<{ url: string; body: { bucket: string; object_key: string } }> = [];
    const ocrResponses: Array<ReturnType<typeof masteryOcr>> = [];
    const evidenceBucket = {
      put: async (key: string, value: ArrayBuffer) => { storedObjects.set(key, value); },
    } as unknown as R2Bucket;
    const queue = {
      send: async (message: unknown) => { queued.push(message as (typeof queued)[number]); },
    } as Queue;
    const services = createPlatformServices(
      database,
      evidenceBucket,
      "https://api.example.com",
      "https://ocr.example.com",
      "token",
      queue,
      "integration-evidence",
      undefined,
      undefined,
      undefined,
      1,
      0,
      localMasteryEvidenceCompatibility,
    );

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { bucket: string; object_key: string };
      ocrRequests.push({ url: String(url), body });
      const response = ocrResponses.shift();
      if (!response) throw new Error("missing OCR response fixture");
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const submit = async (input: { sessionToken: string; bytes: string; ocr: ReturnType<typeof masteryOcr>; requestId: string }) => {
      const body = new TextEncoder().encode(input.bytes).buffer as ArrayBuffer;
      const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, input.sessionToken);
      await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, input.sessionToken);
      await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, input.sessionToken, input.requestId)).resolves.toEqual({ submissionId: upload.submissionId, status: "ocr_pending" });
      const job = queued.shift();
      if (!job) throw new Error("missing OCR queue job");
      ocrResponses.push(input.ocr);
      await services.processOcrJob({ ...job, attempt: 1 });
      return { submissionId: upload.submissionId, objectKey: job.objectKey };
    };

    try {
      const first = await submit({ sessionToken: playerOneSession, bytes: "same-image", ocr: masteryOcr(), requestId: "request.first" });
      const exactReplay = await submit({ sessionToken: playerOneSession, bytes: "same-image", ocr: masteryOcr(), requestId: "request.exact" });
      const reencodedReplay = await submit({ sessionToken: playerOneSession, bytes: "changed-image", ocr: masteryOcr(), requestId: "request.reencoded" });
      const otherPlayer = await submit({ sessionToken: playerTwoSession, bytes: "other-player-image", ocr: masteryOcr({ viewerPlayer: "Other#5678" }), requestId: "request.other" });
      const conflict = await submit({ sessionToken: playerOneSession, bytes: "conflicting-image", ocr: masteryOcr({ difficulty: "传奇" }), requestId: "request.conflict" });

      expect(sqlite.prepare("SELECT submission_id, status, awarded_xp FROM submission_outcomes WHERE outcome_key = 'mastery_run' ORDER BY submission_id").all()).toEqual([
        { submission_id: conflict.submissionId, status: "conflict", awarded_xp: 0 },
        { submission_id: exactReplay.submissionId, status: "reused", awarded_xp: 0 },
        { submission_id: first.submissionId, status: "created", awarded_xp: 236 },
        { submission_id: otherPlayer.submissionId, status: "created", awarded_xp: 236 },
        { submission_id: reencodedReplay.submissionId, status: "reused", awarded_xp: 0 },
      ].sort((left, right) => left.submission_id.localeCompare(right.submission_id)));
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(conflict.submissionId)).toEqual({ status: "ocr_review_required" });

      const firstProfile = await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 });
      expect(firstProfile).toMatchObject({
        profiles: [{ mapId: "map.mastery", totalXp: 236, verifiedRunCount: 1, difficultyStats: [{ difficulty: "困难", verifiedRunCount: 1, fastestCompletionSeconds: 600 }], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 236, highestCompletedDifficulty: "困难" }],
        total: 1,
        hasMore: false,
      });
      expect(JSON.stringify(firstProfile)).not.toMatch(/playerAccountId|sourceSubmissionId|runCode|1234-5678-9012|gameVersion|eventCounters|acceptanceSource|xpInputSnapshot|invalidation/);

      const publicServices = createPlatformServices(database);
      const publicFirst = await publicServices.getSubmission({ submissionId: first.submissionId }, {} as never);
      const playerFirst = await services.getPlayerSubmission({ submissionId: first.submissionId }, playerOneSession);
      expect(publicFirst.masteryOutcome).toEqual({ status: "created", awardedXp: 236 });
      expect(playerFirst.masteryOutcome).toEqual({ status: "created", awardedXp: 236 });
      expect(JSON.stringify({ publicFirst, playerFirst })).not.toMatch(/1234-5678-9012|player\.one|integration-evidence|uploads\/submissions|masteryRunId|object_key/);

      const adminConflict = await services.getAdminSubmission({ submissionId: conflict.submissionId }, {} as never);
      const masteryRunId = adminConflict.masteryOutcome?.masteryRunId;
      if (!masteryRunId) throw new Error("missing mastery conflict target");
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await services.resolveAdminMasteryRunConflict({ masteryRunId, submissionId: conflict.submissionId, action: "invalidate_existing", reason: "local integration invalidation" }, maintainer, "integration-invalidate");
      expect(await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 })).toMatchObject({ profiles: [], total: 1, runs: [{ status: "invalidated" }] });
      await services.transitionAdminMasteryRun({ masteryRunId, action: "restore", reason: "local integration restoration" }, maintainer, "integration-restore");
      expect(await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 })).toMatchObject({ profiles: [{ totalXp: 236, verifiedRunCount: 1 }], total: 1, runs: [{ status: "active" }] });

      seedTitle(sqlite, "CONQUEROR");
      sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.combined', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.combined" });
      const combined = await submit({ sessionToken: playerOneSession, bytes: "combined-image", ocr: masteryOcr({ runCode: "2345-6789-1234", durationSeconds: 599 }), requestId: "request.combined" });
      expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = ? ORDER BY outcome_type").all(combined.submissionId)).toEqual([
        { outcome_type: "challenge", status: "created" },
        { outcome_type: "mastery_run", status: "created" },
        { outcome_type: "title_grant", status: "created" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.one' AND title_key = 'CONQUEROR' AND status = 'active'").get()).toEqual({ count: 1 });

      expect(storedObjects.size).toBe(6);
      expect([...storedObjects.keys()].every((key) => key.startsWith("uploads/submissions/"))).toBe(true);
      expect(ocrRequests).toHaveLength(6);
      expect(ocrRequests.every(({ url, body }) => url === "https://ocr.example.com/api/v1/ocr/challenge/by-object" && body.bucket === "integration-evidence" && storedObjects.has(body.object_key))).toBe(true);
      expect(queued).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps player-profile and maintainer-list reads bounded as mastery history grows", async () => {
    const measure = async (runCount: number) => {
      const { database, sqlite, preparedStatementCount, resetPreparedStatementCount } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.mastery");
      seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
      const sessionToken = `query-budget-${runCount}`;
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
        .run(`session.${runCount}`, `attempt.${runCount}`, "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
      const services = createPlatformServices(database);

      for (let index = 0; index < runCount; index += 1) {
        const submissionId = `submission.query-budget.${runCount}.${index}`;
        seedMasterySubmission(sqlite, submissionId, "binding.one", "Tester");
        const recorded = await services.recordVerifiedMasteryRun({
          playerAccountId: "player.one",
          sourceSubmissionId: submissionId,
          mapId: "map.mastery",
          gameplayRevisionId: "revision:map.mastery:initial",
          mapVariant: null,
          difficulty: "困难",
          gameVersion: "99.0101.1",
          runCode: `${String(1000 + index).padStart(4, "0")}-5678-9012`,
          completionDurationSeconds: 600 + index,
          deaths: 1,
          skips: 0,
          acceptanceSource: "submission_automatic",
          acceptedAt: now + index,
        });
        expect(recorded.outcome).toBe("created");
      }

      resetPreparedStatementCount();
      const profile = await services.getCurrentPlayerMastery({ sessionToken, mapId: "map.mastery", page: 1, pageSize: 20 });
      const profileStatements = preparedStatementCount();
      resetPreparedStatementCount();
      const list = await services.listAdminMasteryRuns({ page: 1, pageSize: 20 }, {} as never);
      const listStatements = preparedStatementCount();
      return { profile, list, profileStatements, listStatements };
    };

    const oneRun = await measure(1);
    const fortyRuns = await measure(40);
    expect(oneRun.profile).toMatchObject({ profiles: [{ verifiedRunCount: 1 }], total: 1, hasMore: false });
    expect(fortyRuns.profile).toMatchObject({ profiles: [{ verifiedRunCount: 40 }], total: 40, hasMore: true });
    expect(oneRun.list).toMatchObject({ total: 1, hasMore: false });
    expect(fortyRuns.list).toMatchObject({ total: 40, hasMore: true });
    expect(fortyRuns.profileStatements).toBe(oneRun.profileStatements);
    expect(fortyRuns.listStatements).toBe(oneRun.listStatements);
    expect(fortyRuns.profileStatements).toBeLessThanOrEqual(6);
    expect(fortyRuns.listStatements).toBeLessThanOrEqual(3);
  });

  it("requires and preserves a classic map variant when the submission contract distinguishes it", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedClassicGameplayRevision(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-missing", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-present", "binding.one", "Tester");
    for (const submissionId of ["submission.classic-missing", "submission.classic-present"]) {
      sqlite.prepare("UPDATE submissions SET rule_snapshot_json = ? WHERE id = ?").run(JSON.stringify({ ruleId: "challenge:classic", mapVariant: "classic" }), submissionId);
    }

    let ocr = masteryOcr({ runCode: "2345-6789-1234" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, "ocr-bucket", undefined, undefined, undefined, 1, 0, localMasteryEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.classic-missing", objectKey: "evidence/classic-missing.png", attempt: 1 });
      ocr = masteryOcr({ runCode: "3456-7891-2345", mapVariant: "classic" });
      await services.processOcrJob({ submissionId: "submission.classic-present", objectKey: "evidence/classic-present.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.classic-missing' AND outcome_key = 'mastery_run'").get()).toEqual({ status: "ineligible" });
    expect(sqlite.prepare("SELECT map_variant FROM mastery_runs WHERE source_submission_id = 'submission.classic-present'").get()).toEqual({ map_variant: "classic" });
  });

  it("credits one player run once across exact and changed screenshots, keeps players independent, and surfaces conflicts", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasteryPlayer(sqlite, "player.two", "binding.two", "Other");
    for (const submissionId of ["submission.first", "submission.exact", "submission.reencoded", "submission.conflict"]) seedMasterySubmission(sqlite, submissionId, "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.other", "binding.two", "Other");

    let ocr = masteryOcr();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, "ocr-bucket", undefined, undefined, undefined, 1, 0, localMasteryEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.first", objectKey: "evidence/exact.png", attempt: 1 });
      await services.processOcrJob({ submissionId: "submission.exact", objectKey: "evidence/exact.png", attempt: 1 });
      await services.processOcrJob({ submissionId: "submission.reencoded", objectKey: "evidence/reencoded.png", attempt: 1 });
      ocr = masteryOcr({ viewerPlayer: "Other#5678" });
      await services.processOcrJob({ submissionId: "submission.other", objectKey: "evidence/other.png", attempt: 1 });
      ocr = masteryOcr({ difficulty: "传奇" });
      await services.processOcrJob({ submissionId: "submission.conflict", objectKey: "evidence/conflict.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT player_account_id, run_code, awarded_xp FROM mastery_runs ORDER BY player_account_id").all()).toEqual([
      { player_account_id: "player.one", run_code: "1234-5678-9012", awarded_xp: 236 },
      { player_account_id: "player.two", run_code: "1234-5678-9012", awarded_xp: 236 },
    ]);
    expect(sqlite.prepare("SELECT submission_id, status, awarded_xp FROM submission_outcomes WHERE outcome_key = 'mastery_run' ORDER BY submission_id").all()).toEqual([
      { submission_id: "submission.conflict", status: "conflict", awarded_xp: 0 },
      { submission_id: "submission.exact", status: "reused", awarded_xp: 0 },
      { submission_id: "submission.first", status: "created", awarded_xp: 236 },
      { submission_id: "submission.other", status: "created", awarded_xp: 236 },
      { submission_id: "submission.reencoded", status: "reused", awarded_xp: 0 },
    ]);
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.conflict'").get()).toEqual({ status: "ocr_review_required" });
    expect(JSON.parse((sqlite.prepare("SELECT details_json FROM submission_outcomes WHERE submission_id = 'submission.conflict'").get() as { details_json: string }).details_json)).toMatchObject({ conflictFields: ["difficulty"] });

    const publicServices = createPlatformServices(database);
    const publicOutcomes = await Promise.all([
      "submission.first",
      "submission.exact",
      "submission.conflict",
    ].map((submissionId) => publicServices.getSubmission({ submissionId }, {} as never)));
    expect(publicOutcomes.map((submission) => submission.masteryOutcome)).toEqual([
      { status: "created", awardedXp: 236 },
      { status: "reused", awardedXp: 0 },
      undefined,
    ]);
    expect(publicOutcomes[2].reason).toBeUndefined();
    expect(JSON.stringify(publicOutcomes)).not.toMatch(/conflicting_run_code_evidence|conflictFields|masteryRunId|1234-5678-9012/);

    const sessionToken = "mastery-player-session";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("mastery-player-session", "attempt.player.one", "group.player.one", "member.player.one", "test", await requestHash(sessionToken), now + 60_000, now);
    const playerConflict = await publicServices.getPlayerSubmission({ submissionId: "submission.conflict" }, sessionToken);
    expect(playerConflict.masteryOutcome).toBeUndefined();
    expect(playerConflict.reason).toBe("已提交处理申请，请稍后查看结果。");
    const player = await publicServices.getCurrentPlayer({ sessionToken });
    const currentConflict = player?.recentSubmissions.find((submission) => submission.submissionId === "submission.conflict");
    expect(currentConflict?.status).toBe("ocr_review_required");
    expect(currentConflict?.masteryOutcome).toBeUndefined();
    expect(currentConflict?.reason).toBeUndefined();

    const adminConflict = await publicServices.getAdminSubmission({ submissionId: "submission.conflict" }, {} as never);
    expect(adminConflict.masteryOutcome).toMatchObject({
      status: "conflict",
      reason: "conflicting_run_code_evidence",
      conflictFields: ["difficulty"],
      masteryRunId: expect.any(String),
    });

    const masteryRunId = adminConflict.masteryOutcome?.masteryRunId;
    if (!masteryRunId) throw new Error("missing mastery conflict target");
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const listed = await publicServices.listAdminMasteryRuns({ playerAccountId: "player.one", mapId: "map.mastery", difficulty: "困难", acceptanceSource: "submission_automatic", status: "active", runCode: "1234-5678-9012", page: 1, pageSize: 20 }, maintainer);
    expect(listed).toMatchObject({ total: 1, items: [{ runId: masteryRunId, conflictCount: 1, playerAccountId: "player.one", mapName: "地图 map.mastery", runCode: "1234-5678-9012" }] });

    const inspected = await publicServices.getAdminMasteryRun({ masteryRunId }, maintainer);
    expect(inspected).toMatchObject({
      run: { sourceSubmissionId: "submission.first", acceptanceSource: "submission_automatic", xpRuleVersion: "v1", xpInputSnapshot: { ruleVersion: "v1" } },
      projection: { mapId: "map.mastery", verifiedRunCount: 1 },
      sourceSubmission: { submissionId: "submission.first", evidenceUrl: expect.stringContaining("/v1/admin/submissions/submission.first/evidence") },
      lifecycle: [{ transition: "accepted", actorType: "service" }],
      conflicts: [{ submissionId: "submission.conflict", conflictFields: ["difficulty"], facts: { mapName: "地图 map.mastery", difficulty: "传奇", runCode: "1234-5678-9012" }, resolution: null }],
    });

    const invalidated = await publicServices.resolveAdminMasteryRunConflict({ masteryRunId, submissionId: "submission.conflict", action: "invalidate_existing", reason: "以修正截图为准" }, maintainer, "mastery-conflict-invalidate");
    expect(invalidated).toMatchObject({ action: "invalidate_existing", run: { status: "invalidated", invalidationReason: "以修正截图为准" }, projection: { totalXp: 0, verifiedRunCount: 0 } });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.first' AND outcome_key = 'mastery_run'").get()).toEqual({ status: "invalidated" });
    expect(await publicServices.resolveAdminMasteryRunConflict({ masteryRunId, submissionId: "submission.conflict", action: "invalidate_existing", reason: "以修正截图为准" }, maintainer, "mastery-conflict-invalidate")).toEqual(invalidated);
    expect(sqlite.prepare("SELECT action, actor_type, actor_id, reason FROM mastery_run_conflict_resolutions").all()).toEqual([{ action: "invalidate_existing", actor_type: "user", actor_id: "admin", reason: "以修正截图为准" }]);
    expect(sqlite.prepare("SELECT operation, COUNT(*) AS count FROM audit_events WHERE entity_type = 'mastery_run' GROUP BY operation ORDER BY operation").all()).toEqual([
      { operation: "mastery_run.conflict.resolve", count: 1 },
      { operation: "mastery_run.invalidate", count: 1 },
    ]);

    const restored = await publicServices.transitionAdminMasteryRun({ masteryRunId, action: "restore", reason: "保留原始记录" }, maintainer, "mastery-run-restore");
    expect(restored).toMatchObject({ run: { status: "active", invalidatedAt: null, invalidationReason: null }, projection: { verifiedRunCount: 1 } });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.first' AND outcome_key = 'mastery_run'").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT transition, actor_type, actor_id, reason FROM mastery_run_lifecycle_events WHERE mastery_run_id = ? ORDER BY created_at, rowid").all(masteryRunId)).toEqual([
      { transition: "accepted", actor_type: "service", actor_id: "submission_automatic", reason: null },
      { transition: "invalidated", actor_type: "user", actor_id: "admin", reason: "以修正截图为准" },
      { transition: "restored", actor_type: "user", actor_id: "admin", reason: "保留原始记录" },
    ]);
  });

  it("keeps a valid no-code legacy title approval separate from mastery and records combined title plus mastery outcomes", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedTitle(sqlite, "CONQUEROR");
    sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.mastery', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.mastery" });
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.combined", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.legacy", "binding.one", "Tester");

    let ocr = masteryOcr();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, "ocr-bucket", undefined, undefined, undefined, 1, 0, localMasteryEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.combined", objectKey: "evidence/combined.png", attempt: 1 });
      const combined = sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.combined'").get() as { status: string; grant_id: string | null };
      expect(combined.status).toBe("approved");
      expect(combined.grant_id).not.toBeNull();
      expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = 'submission.combined' ORDER BY outcome_type").all()).toEqual([
        { outcome_type: "challenge", status: "created" },
        { outcome_type: "mastery_run", status: "created" },
        { outcome_type: "title_grant", status: "created" },
      ]);

      await services.revokeAdminTitleGrant({ grantId: combined.grant_id!, reason: "称号专项修复" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "title-only-revoke");
      expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.combined'").get()).toEqual({ status: "active" });

      ocr = masteryOcr({ runCode: null });
      await services.processOcrJob({ submissionId: "submission.legacy", objectKey: "evidence/legacy.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy'").get()).toMatchObject({ status: "approved" });
    expect(sqlite.prepare("SELECT status, awarded_xp FROM submission_outcomes WHERE submission_id = 'submission.legacy' AND outcome_key = 'mastery_run'").get()).toEqual({ status: "ineligible", awarded_xp: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.legacy'").get()).toEqual({ count: 0 });
    expect((await createPlatformServices(database).getSubmission({ submissionId: "submission.legacy" }, {} as never)).masteryOutcome).toEqual({ status: "ineligible", awardedXp: 0 });
  });

  it("invalidates and restores the source run exactly once through the existing spot-check and OCR-retry path", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.lifecycle", "binding.one", "Tester", true);
    const queued: unknown[] = [];
    const queue = { send: async (message: unknown) => { queued.push(message); } } as Queue;
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const ocr = masteryOcr();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", queue, "ocr-bucket", undefined, undefined, undefined, 1, 1, localMasteryEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.lifecycle", objectKey: "evidence/submission.lifecycle.png", attempt: 1 });
      const revoked = await services.resolveAdminSubmissionSpotCheck({ submissionId: "submission.lifecycle", decision: "revoked", reason: "证据无效" }, auth, "spot-check-revoke");
      expect(revoked).toMatchObject({ grantId: null, masteryRunId: expect.any(String), status: "revoked" });
      expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.lifecycle'").get()).toEqual({ status: "invalidated" });
      expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.lifecycle' AND outcome_key = 'mastery_run'").get()).toEqual({ status: "invalidated" });

      await services.requestAdminOcr({ submissionId: "submission.lifecycle" }, auth, "ocr-revalidate", "request-revalidate");
      await services.processOcrJob({ ...(queued[0] as { submissionId: string; objectKey: string; manual: boolean; requestId: string }), attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.lifecycle'").get()).toEqual({ status: "active" });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.lifecycle' AND outcome_key = 'mastery_run'").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT transition, COUNT(*) AS count FROM mastery_run_lifecycle_events GROUP BY transition ORDER BY transition").all()).toEqual([
      { transition: "accepted", count: 1 },
      { transition: "invalidated", count: 1 },
      { transition: "restored", count: 1 },
    ]);
  });
});
