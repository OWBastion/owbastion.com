import {
  achievementChallengeMapsSchema,
  achievementChallengesSchema,
  attachmentsSchema,
  auditEventsRequiredIdSchema,
  bindingInvitesSchema,
  bindingsSchema,
  effectGlossaryTermsSchema,
  gameplayRevisionChallengeAssignmentsSchema,
  gameplayRevisionsSchema,
  idempotencyKeysRequiredIdSchema,
  mapMetadataSchema,
  mapTitleRewardsSchema,
  mapTitleRuleCompatSchema,
  mapTitleRuleExceptionsSchema,
  mapTitleRulesSchema,
  mapsSchema,
  ocrFeedbackProposalsWithoutReviewStateSchema,
  ocrResultsSchema,
  playerAccountsSchema,
  qqGroupAccessSchema,
  qqLoginAttemptsSchema,
  qqSessionsSchema,
  randomEventMapChallengesSchema,
  randomEventTitleChallengesSchema,
  randomEventsSchema,
  reviewedAnnotationsSchemaWithoutReferences,
  submissionOutcomesWithReferencesSchema,
  submissionReviewsSchema,
  titleCatalogSchema,
  verifiedRunsSchema,
} from "../test/schema";
import { DatabaseSync } from "node:sqlite";
import { createTestD1 } from "../test/d1";

/**
 * D1 test harness shared by `map-title-rule.test.ts` and the OCR auto-match
 * query-budget suite (issue #241). Lives outside `*.test.ts` so importing it
 * does not re-register another file's `describe`/`it` blocks.
 */
const now = Date.now();

export const createOcrDifficultyResponse = (mapName: string, difficulty: string, layoutVersion = "test-layout-v1") => ({
  schema_version: "1",
  ok: true,
  layout_version: layoutVersion,
  fields: {
    challenge_completed: { status: "ok", confidence: 0.99 },
    viewer_player: { status: "ok", confidence: 0.99 },
    map_name: { status: "ok", confidence: 0.99 },
    difficulty: { status: "ok", confidence: 0.99 },
  },
  data: { challenge_completed: true, viewer_player: "Tester", map_name: mapName, difficulty },
});

export const createD1 = () => {
  const { database, sqlite, getCount: preparedStatementCount, resetCount: resetPreparedStatementCount } = createTestD1({
    foreignKeys: true,
    batchMode: "immediate",
    countPreparations: true,
    execReturnsD1Result: true,
  });
  return {
    database,
    sqlite,
    preparedStatementCount,
    resetPreparedStatementCount,
  };
};

export const fakeEvidenceBucket = {
  get: async () => ({ size: 1, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => new Uint8Array([1]).buffer }),
} as unknown as R2Bucket;

export const installSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    ${mapsSchema}
    ${gameplayRevisionsSchema}
    ${gameplayRevisionChallengeAssignmentsSchema}
    CREATE UNIQUE INDEX gameplay_revision_challenge_assignments_unique_idx
      ON gameplay_revision_challenge_assignments (gameplay_revision_id, challenge_family, challenge_id);
    ${titleCatalogSchema}
    ${mapTitleRulesSchema}
    CREATE UNIQUE INDEX map_title_rules_kind_idx ON map_title_rules (kind);
    CREATE UNIQUE INDEX map_title_rules_title_key_idx ON map_title_rules (title_key);
    ${mapTitleRuleExceptionsSchema}
    CREATE UNIQUE INDEX map_title_rule_exceptions_rule_map_idx
      ON map_title_rule_exceptions (rule_id, map_id);
    ${mapTitleRuleCompatSchema}
    CREATE UNIQUE INDEX map_title_rule_compat_rule_map_idx
      ON map_title_rule_compat (rule_id, map_id);
    ${playerAccountsSchema}
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
    ${achievementChallengesSchema}
    ${mapTitleRewardsSchema}
    ${bindingsSchema}
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
    ${verifiedRunsSchema(false)}
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
    ${submissionOutcomesWithReferencesSchema}
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
    ${submissionReviewsSchema}
    CREATE INDEX submission_reviews_submission_created_idx ON submission_reviews (submission_id, created_at);
    ${idempotencyKeysRequiredIdSchema}
    ${auditEventsRequiredIdSchema}
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
    ${achievementChallengeMapsSchema}
    ${mapMetadataSchema}
    ${randomEventsSchema}
    ${randomEventMapChallengesSchema}
    ${randomEventTitleChallengesSchema}
    CREATE TABLE random_event_imports (
      id TEXT PRIMARY KEY NOT NULL,
      source_hash TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      imported_by TEXT NOT NULL,
      imported_at INTEGER NOT NULL
    );
    ${effectGlossaryTermsSchema}
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
    ${bindingInvitesSchema}
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
    ${qqGroupAccessSchema}
    CREATE TABLE qq_group_policy_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      request_id TEXT,
      created_at INTEGER NOT NULL,
      enqueued_at INTEGER,
      delivered_at INTEGER
    );
    ${qqLoginAttemptsSchema}
    ${qqSessionsSchema}
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
    ${ocrResultsSchema}
    ${attachmentsSchema}
    ${ocrFeedbackProposalsWithoutReviewStateSchema}
    ${reviewedAnnotationsSchemaWithoutReferences}
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
