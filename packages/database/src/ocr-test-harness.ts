import { DatabaseSync } from "node:sqlite";

/**
 * D1 test harness shared by `map-title-rule.test.ts` and the OCR auto-match
 * query-budget suite (issue #241). Lives outside `*.test.ts` so importing it
 * does not re-register another file's `describe`/`it` blocks.
 */
const now = Date.now();

/**
 * Minimal D1Database shim over node:sqlite, reused from catalog-query-budget.test.ts.
 */
export const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  let preparedStatementCount = 0;

  const wrapStatement = (sql: string) => {
    let bound: unknown[] = [];
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() { return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null; },
      async all<T>() {
        const results = sqlite.prepare(sql).all(...bound) as T[];
        const changes = isWrite ? Number((sqlite.prepare("SELECT changes() AS changes").get() as { changes: number }).changes) : 0;
        return { results, success: true, meta: { changes, duration: 0, size_after: 0, rows_read: results.length, rows_written: changes, last_row_id: 0, changed_db: changes > 0 } };
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
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
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

export const fakeEvidenceBucket = {
  get: async () => ({ size: 1, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => new Uint8Array([1]).buffer }),
} as unknown as R2Bucket;

export const installSchema = (sqlite: DatabaseSync) => {
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
      starts_at INTEGER,
      ends_at INTEGER,
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
      lifecycle TEXT NOT NULL DEFAULT 'active',
      public_visibility INTEGER NOT NULL DEFAULT 1,
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
      starts_at INTEGER,
      ends_at INTEGER,
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
    CREATE TABLE player_title_entitlements (player_account_id TEXT PRIMARY KEY, all_titles INTEGER NOT NULL DEFAULT 1);
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
      revoke_reason TEXT,
      completion_id TEXT,
      revocation_type TEXT
    );
    CREATE UNIQUE INDEX player_title_grants_source_idx
      ON player_title_grants (source_type, source_id, title_key);
    CREATE TABLE challenges (
      id TEXT PRIMARY KEY NOT NULL,
      source_family TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      rule_version TEXT NOT NULL DEFAULT 'legacy',
      map_id TEXT,
      gameplay_revision_id TEXT,
      status TEXT NOT NULL,
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
    CREATE UNIQUE INDEX challenges_manual_title_idx ON challenges(title_key) WHERE manual = 1 AND status = 'active';
    CREATE TABLE challenge_completions (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      gameplay_revision_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      completed_at INTEGER NOT NULL,
      invalidated_by TEXT,
      invalidated_at INTEGER,
      invalidation_reason TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX challenge_completions_player_challenge_idx ON challenge_completions(player_account_id, challenge_id, COALESCE(gameplay_revision_id, '')) WHERE status = 'active';
    CREATE UNIQUE INDEX challenge_completions_source_idx ON challenge_completions(source_type, source_id, challenge_id);
    CREATE TABLE challenge_satisfies (
      challenge_id TEXT NOT NULL REFERENCES challenges(id),
      satisfied_challenge_id TEXT NOT NULL REFERENCES challenges(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (challenge_id, satisfied_challenge_id),
      CHECK (challenge_id <> satisfied_challenge_id)
    );
    CREATE TABLE player_equipped_titles (
      grant_id TEXT PRIMARY KEY REFERENCES player_title_grants(id),
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      equipped_at INTEGER NOT NULL
    );
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
      player_account_id TEXT,
      binding_id TEXT,
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
    CREATE TABLE submission_challenge_selections (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      challenge_type TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      target_map_id TEXT REFERENCES maps(id),
      gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
      map_name TEXT NOT NULL,
      difficulty TEXT,
      rule_snapshot_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (submission_id, position)
    );
    CREATE TABLE mastery_runs (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL,
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
    CREATE INDEX submission_reviews_submission_created_idx ON submission_reviews (submission_id, created_at);
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
      progress_rule TEXT,
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
      event_group TEXT, effect_tags_json TEXT NOT NULL DEFAULT '[]',
      release_status TEXT NOT NULL,
      archived_at INTEGER,
      archived_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE random_event_versions (
      game_version TEXT PRIMARY KEY NOT NULL,
      availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'suspended')),
      suspended_at INTEGER,
      suspended_by TEXT,
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
      legacy_passkey_player_account_id TEXT,
      legacy_passkey_challenge_id TEXT,
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
    CREATE TABLE portal_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TRIGGER submissions_player_account_legacy_backfill
    AFTER INSERT ON submissions
    WHEN NEW.player_account_id IS NULL AND NEW.binding_id IS NOT NULL
    BEGIN
      UPDATE submissions SET player_account_id = (SELECT player_account_id FROM bindings WHERE id = NEW.binding_id) WHERE id = NEW.id;
    END;
    CREATE TRIGGER qq_sessions_portal_session_backfill
    AFTER INSERT ON qq_sessions
    BEGIN
      INSERT OR IGNORE INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at)
      SELECT NEW.id, player_account_id, NEW.token_hash, NEW.expires_at, NEW.created_at
      FROM bindings WHERE member_open_id = NEW.member_open_id AND status = 'active';
    END;
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
    CREATE TABLE ocr_results (manual INTEGER NOT NULL DEFAULT 0, callback_claimed INTEGER NOT NULL DEFAULT 0,
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
      field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'map_variant', 'achievement_titles')),
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
    CREATE TABLE reviewed_annotations (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL,
      ocr_result_id TEXT NOT NULL,
      proposal_id TEXT,
      field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'map_variant', 'achievement_titles')),
      original_ocr_value TEXT,
      model_version TEXT,
      layout_version TEXT,
      reviewed_value TEXT NOT NULL CHECK (length(trim(reviewed_value)) > 0),
      normalized_value TEXT,
      player_account_id TEXT,
      player_proposed_value TEXT,
      prompt_origin TEXT,
      review_state TEXT NOT NULL DEFAULT 'accepted' CHECK (review_state IN ('accepted', 'superseded')),
      reviewed_by TEXT NOT NULL,
      reviewed_at INTEGER NOT NULL,
      note TEXT,
      supersedes_annotation_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX reviewed_annotations_active_field_idx ON reviewed_annotations (submission_id, ocr_result_id, field_key) WHERE review_state = 'accepted';
    CREATE TABLE ocr_accuracy_feedback (
      id TEXT PRIMARY KEY NOT NULL,
      submission_id TEXT NOT NULL,
      ocr_result_id TEXT NOT NULL,
      accuracy TEXT NOT NULL CHECK (accuracy IN ('accurate', 'inaccurate')),
      marked_by TEXT NOT NULL,
      marked_by_type TEXT NOT NULL CHECK (marked_by_type IN ('player', 'maintainer')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX ocr_accuracy_feedback_result_idx ON ocr_accuracy_feedback (submission_id, ocr_result_id);
  `);
};

export const seedMap = (sqlite: DatabaseSync, id: string, status: "active" | "retired" = "active") => {
  sqlite.prepare(
    "INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, '2026.07.15', ?, '2026.07.15', ?, ?)",
  ).run(id, `地图 ${id}`, status, now, now);
  sqlite.prepare(
    "INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, NULL, '2026.07.15', ?, ?)",
  ).run(`revision:${id}:initial`, id, status === "active" ? "default" : "historical", now, now);
};

export const seedRevisionAssignment = (sqlite: DatabaseSync, input: {
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

export const seedTitle = (sqlite: DatabaseSync, key: string) => {
  sqlite.prepare(
    "INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES (?, ?, 'trophy', '地图系列', '条件', 'active', 'map', 'map_name_suffix', 'null', '2026.07.15')",
  ).run(key, `称号 ${key}`);
};

/** Drive an existing recognition fixture through dispatch and callback delivery. */
export const deliverOcrFixture = async (
  services: import("@owbastion/domain").PlatformServices,
  sqlite: DatabaseSync,
  input: { submissionId: string; objectKey: string; attempt: number; manual?: boolean; requestId?: string; jobId?: string },
) => {
  const submission = sqlite.prepare("SELECT status, updated_at FROM submissions WHERE id = ?").get(input.submissionId) as { status: string; updated_at: number } | undefined;
  if (!submission || submission.status !== "ocr_pending") return;
  const pending = sqlite.prepare("SELECT id FROM ocr_results WHERE submission_id = ? AND status = 'pending' ORDER BY created_at DESC, id DESC LIMIT 1").get(input.submissionId) as { id: string } | undefined;
  const jobId = input.jobId ?? pending?.id ?? crypto.randomUUID();
  sqlite.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, attempt, status, manual, created_at) VALUES (?, ?, ?, 'pending', ?, ?)").run(jobId, input.submissionId, input.attempt, Number(Boolean(input.manual)), submission.updated_at);
  const fixtureFetch = globalThis.fetch;
  let result: unknown;
  globalThis.fetch = async (...args) => {
    const response = await fixtureFetch(...args);
    if (response.status !== 200) return response;
    result = { ...await response.json() as object, request_id: jobId };
    return Response.json({ jobId, status: "accepted" }, { status: 202 });
  };
  try {
    await services.processOcrJob({ ...input, jobId });
  } finally {
    globalThis.fetch = fixtureFetch;
  }
  if (result) await services.completeOcrJob({ jobId, payload: { contractVersion: "1", result } as import("@owbastion/contracts").OcrkitJobCallback });
};
