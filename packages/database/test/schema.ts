export const titleCatalogSchema = `CREATE TABLE title_catalog (
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
  );`;

export const auditEventsRequiredIdSchema = `CREATE TABLE audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    correlation_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`;

export const playerAccountsSchema = `CREATE TABLE player_accounts (
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
    );`;

export const bindingsSchema = `CREATE TABLE bindings (
    id TEXT PRIMARY KEY NOT NULL, identity_id TEXT NOT NULL, player_account_id TEXT NOT NULL,
    provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL
  );`;

export const bindingInvitesSchema = `CREATE TABLE binding_invites (
    id TEXT PRIMARY KEY NOT NULL, code_hash TEXT NOT NULL, code_ciphertext TEXT, player_name TEXT NOT NULL,
    normalized_player_name TEXT NOT NULL, player_id TEXT NOT NULL, created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, redeemed_at INTEGER,
    legacy_passkey_player_account_id TEXT, legacy_passkey_challenge_id TEXT,
    revoked_at INTEGER, revoked_by TEXT
  );`;

export const portalSessionsSchema = `CREATE TABLE portal_sessions (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );`;

export const submissionsSchema = `CREATE TABLE submissions (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL, binding_id TEXT, status TEXT NOT NULL,
    challenge_type TEXT NOT NULL, challenge_id TEXT, target_map_id TEXT, gameplay_revision_id TEXT,
    map_name TEXT NOT NULL, difficulty TEXT, player_name TEXT, review_reason TEXT, grant_id TEXT,
    ocr_fail_count INTEGER NOT NULL DEFAULT 0, rule_snapshot_json TEXT, source_provider TEXT NOT NULL,
    source_conversation_id TEXT NOT NULL, source_message_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );`;

export const ocrResultsSchema = `CREATE TABLE ocr_results (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, request_id TEXT, attempt INTEGER NOT NULL,
    status TEXT NOT NULL, response_json TEXT, match_json TEXT, error_code TEXT, created_at INTEGER NOT NULL
  );`;

export const ocrAccuracyFeedbackSchema = `CREATE TABLE ocr_accuracy_feedback (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, ocr_result_id TEXT NOT NULL,
    accuracy TEXT NOT NULL CHECK (accuracy IN ('accurate', 'inaccurate')),
    marked_by TEXT NOT NULL, marked_by_type TEXT NOT NULL CHECK (marked_by_type IN ('player', 'maintainer')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (submission_id, ocr_result_id)
  );`;

const createOcrFeedbackProposalsSchema = (includeReviewState: boolean) => `CREATE TABLE ocr_feedback_proposals (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, ocr_result_id TEXT NOT NULL,
    field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'map_variant', 'achievement_titles')),
    original_value TEXT, feedback_type TEXT NOT NULL CHECK (feedback_type IN ('confirmed', 'corrected', 'passive_report')),
    prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
    proposed_value TEXT, model_version TEXT, layout_version TEXT, player_account_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
    ${includeReviewState ? "review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'accepted', 'rejected'))," : ""}
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (submission_id, ocr_result_id, field_key, player_account_id)
  );`;

export const ocrFeedbackProposalsSchema = createOcrFeedbackProposalsSchema(true);
export const ocrFeedbackProposalsWithoutReviewStateSchema = createOcrFeedbackProposalsSchema(false);

const createReviewedAnnotationsSchema = (enforceReferences: boolean) => `CREATE TABLE reviewed_annotations (
    id TEXT PRIMARY KEY NOT NULL,
    submission_id TEXT NOT NULL,
    ocr_result_id TEXT NOT NULL,
    proposal_id TEXT${enforceReferences ? " REFERENCES ocr_feedback_proposals(id)" : ""},
    field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'map_variant', 'achievement_titles')),
    original_ocr_value TEXT,
    model_version TEXT,
    layout_version TEXT,
    reviewed_value TEXT NOT NULL CHECK (length(trim(reviewed_value)) > 0),
    normalized_value TEXT,
    player_account_id TEXT,
    player_proposed_value TEXT,
    prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
    review_state TEXT NOT NULL DEFAULT 'accepted' CHECK (review_state IN ('accepted', 'superseded')),
    reviewed_by TEXT NOT NULL,
    reviewed_at INTEGER NOT NULL,
    note TEXT,
    supersedes_annotation_id TEXT${enforceReferences ? " REFERENCES reviewed_annotations(id)" : ""},
    created_at INTEGER NOT NULL
  );`;

export const reviewedAnnotationsSchema = createReviewedAnnotationsSchema(true);
export const reviewedAnnotationsSchemaWithoutReferences = createReviewedAnnotationsSchema(false);

export const idempotencyKeysRequiredIdSchema = `CREATE TABLE idempotency_keys (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`;

export const attachmentsSchema = `CREATE TABLE attachments (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, provider TEXT NOT NULL,
    external_attachment_id TEXT NOT NULL, content_type TEXT NOT NULL, byte_size INTEGER,
    sha256 TEXT, object_key TEXT, upload_status TEXT NOT NULL, created_at INTEGER NOT NULL
  );`;

export const submissionOutcomesSchema = `CREATE TABLE submission_outcomes (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, outcome_key TEXT NOT NULL,
    outcome_type TEXT NOT NULL, status TEXT NOT NULL, entity_id TEXT, awarded_xp INTEGER NOT NULL DEFAULT 0,
    details_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );`;

export const submissionOutcomesWithReferencesSchema = `CREATE TABLE submission_outcomes (
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
  );`;

export const submissionReviewsSchema = `CREATE TABLE submission_reviews (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, decision TEXT NOT NULL,
    reason TEXT, reviewer TEXT NOT NULL, created_at INTEGER NOT NULL
  );`;

export const mapsSchema = `CREATE TABLE maps (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );`;

export const gameplayRevisionsSchema = `CREATE TABLE gameplay_revisions (
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
    );`;

export const gameplayRevisionChallengeAssignmentsSchema = `CREATE TABLE gameplay_revision_challenge_assignments (
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
      updated_at INTEGER NOT NULL
    );`;

export const verifiedRunsSchema = (enforcePlayerAccountReference: boolean) => `CREATE TABLE mastery_runs (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL${enforcePlayerAccountReference ? " REFERENCES player_accounts(id)" : ""},
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
    );`;

export const randomEventsSchema = `CREATE TABLE random_events (
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
    );`;

export const effectGlossaryTermsSchema = `CREATE TABLE effect_glossary_terms (
      key TEXT PRIMARY KEY NOT NULL,
      name_zh TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      definition TEXT NOT NULL,
      rules_json TEXT NOT NULL DEFAULT '[]',
      source_version TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );`;

export const mapMetadataSchema = `CREATE TABLE map_metadata (
      map_id TEXT PRIMARY KEY NOT NULL REFERENCES maps(id),
      difficulty_rating TEXT,
      mechanics_json TEXT NOT NULL DEFAULT '[]',
      cover_url TEXT,
      background_url TEXT,
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL
    );`;
export const achievementChallengeMapsSchema = `CREATE TABLE achievement_challenge_maps (
      challenge_id TEXT NOT NULL REFERENCES title_challenges(id) ON DELETE CASCADE,
      map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      PRIMARY KEY (challenge_id, map_id)
    );`;
export const mapTitleRewardsSchema = `CREATE TABLE map_title_rewards (
      map_id TEXT NOT NULL REFERENCES maps(id),
      slot TEXT NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      pioneer_prefixes_json TEXT NOT NULL,
      PRIMARY KEY (map_id, slot)
    );`;
export const mapTitleRulesSchema = `CREATE TABLE map_title_rules (
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
    );`;
export const mapTitleRuleExceptionsSchema = `CREATE TABLE map_title_rule_exceptions (
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
    );`;
export const mapTitleRuleCompatSchema = `CREATE TABLE map_title_rule_compat (
      legacy_challenge_id TEXT NOT NULL,
      rule_id TEXT NOT NULL REFERENCES map_title_rules(id),
      map_id TEXT NOT NULL REFERENCES maps(id),
      is_standard_instance INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (legacy_challenge_id, map_id)
    );`;
export const achievementChallengesSchema = `CREATE TABLE achievement_challenges (
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
    );`;
export const randomEventMapChallengesSchema = `CREATE TABLE random_event_map_challenges (
      event_id TEXT NOT NULL REFERENCES random_events(id),
      challenge_id TEXT NOT NULL REFERENCES achievement_challenges(id),
      PRIMARY KEY (event_id, challenge_id)
    );`;
export const randomEventTitleChallengesSchema = `CREATE TABLE random_event_title_challenges (
      event_id TEXT NOT NULL REFERENCES random_events(id),
      challenge_id TEXT NOT NULL REFERENCES title_challenges(id),
      PRIMARY KEY (event_id, challenge_id)
    );`;
export const qqGroupAccessSchema = `CREATE TABLE qq_group_access (
    group_open_id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL DEFAULT '', environment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    bind_enabled INTEGER NOT NULL DEFAULT 0, verify_enabled INTEGER NOT NULL DEFAULT 0,
    lifecycle_occurred_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );`;
export const qqLoginAttemptsSchema = `CREATE TABLE qq_login_attempts (
    id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL, code_hash TEXT NOT NULL, status TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login', player_account_id TEXT, target_group_open_id TEXT,
    group_open_id TEXT, member_open_id TEXT, environment TEXT, message_id TEXT,
    session_token_hash TEXT, session_issued_at INTEGER, expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL, verified_at INTEGER
  );`;
export const qqSessionsSchema = `CREATE TABLE qq_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      attempt_id TEXT NOT NULL,
      group_open_id TEXT NOT NULL,
      member_open_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );`;
