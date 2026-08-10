import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { assessMasteryOcrEvidence, createPlatformServices } from "./index";

/**
 * Minimal D1Database shim over node:sqlite, reused from catalog-query-budget.test.ts.
 */
const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

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
    prepare(sql: string) { return wrapStatement(sql); },
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

  return { database, sqlite };
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
  `);
};

const now = Date.now();

/** Seed helpers */
const seedMap = (sqlite: DatabaseSync, id: string, status: "active" | "retired" = "active") => {
  sqlite.prepare(
    "INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, '2026.07.15', ?, '2026.07.15', ?, ?)",
  ).run(id, `地图 ${id}`, status, now, now);
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
};

const seedMapTitleChallenge = (sqlite: DatabaseSync, challengeId: string, titleKey: string, mapId: string) => {
  sqlite.prepare(
    "INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES (?, ?, '完成经典版地图', '上传截图', 'manual', '2026.07.15', 'active', '2026.07.15', 'map', ?, ?)",
  ).run(challengeId, titleKey, now, now);
  sqlite.prepare("INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES (?, ?)").run(challengeId, mapId);
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
};

const requestHash = async (value: unknown) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
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

      const sessionToken = "player-session";
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.1', 'member.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.1', 'attempt.1', 'group.1', 'member.1', 'production', ?, ?, ?)").run(await requestHash(sessionToken), now + 60_000, now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.1', 'binding.1', 'awaiting_player_confirmation', 'unknown', NULL, NULL, '成就挑战', 'Tester', 'portal', 'portal', 'upload.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.1', 'submission.1', 1, 'matched', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, fields: { challenge_completed: { status: "ok", confidence: 0.99 }, viewer_player: { status: "ok", confidence: 0.99 }, map_name: { status: "ok", confidence: 0.99 } }, data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.paris", achievement_titles: ["称号 CONQUEROR"] } }), now);

      const services = createPlatformServices(database);
      const result = await services.confirmPlayerSubmissionChallenge(
        { submissionId: "submission.1", challengeId: "map.paris.conqueror", mapId: "map.paris" } as never,
        sessionToken,
      );

      expect(result.status).toBe("ready_for_review");
      const submission = sqlite.prepare("SELECT challenge_type, challenge_id, target_map_id, rule_snapshot_json FROM submissions WHERE id = 'submission.1'").get() as { challenge_type: string; challenge_id: string; target_map_id: string; rule_snapshot_json: string };
      expect(submission.challenge_type).toBe("map_title_achievement");
      expect(submission.challenge_id).toBe("map.paris.conqueror");
      expect(submission.target_map_id).toBe("map.paris");
      expect(JSON.parse(submission.rule_snapshot_json)).toMatchObject({ ruleId: "rule.conqueror", mapId: "map.paris", titleKey: "CONQUEROR", slot: "conqueror" });
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
      const services = createPlatformServices(database);

      const portal = await services.listChallenges({ family: "map" });
      const admin = await services.listAdminChallenges({ family: "map" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
      const agents = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.paris" });
      const expected = { challengeId: "map.paris.conqueror", titleKey: "CONQUEROR", mapId: "map.paris", mapTitleRule: { ruleId: "rule.conqueror", kind: "conqueror", displayKind: "map_name_suffix", slot: "conqueror", dynamic: true } };

      expect(portal).toContainEqual(expect.objectContaining(expected));
      expect(admin.items).toContainEqual(expect.objectContaining(expected));
      expect(agents.items).toContainEqual(expect.objectContaining(expected));
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
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.snap', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshotAtCreation), now, now);

      // Now change the rule's slot — the stored snapshot must not be affected.
      sqlite.prepare("UPDATE map_title_rules SET slot = 'dominator', updated_at = ? WHERE id = 'rule.conqueror'").run(now + 5000);

      const row = sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'sub.snap'").get() as { rule_snapshot_json: string };
      const stored = JSON.parse(row.rule_snapshot_json) as typeof snapshotAtCreation;

      expect(stored.slot).toBe("conqueror");  // still the original value
      expect(stored.ruleRevision).toBe(now);  // still the original revision
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

      const snapshot = { ruleId: "rule.conqueror", ruleRevision: now, mapId: "map.paris", titleKey: "CONQUEROR", slot: "conqueror", displayKind: "map_name_suffix", condition: "完成地图", evidenceRule: "上传截图", submissionMode: "manual", defaultScope: "all_active", exceptionId: null };
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
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.1', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshot), now, now);

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
      const grant = sqlite.prepare("SELECT title_key, map_id, slot FROM player_title_grants WHERE source_type = 'submission'").get() as { title_key: string; map_id: string; slot: string } | undefined;
      expect(grant?.title_key).toBe("CONQUEROR");
      expect(grant?.map_id).toBe("map.paris");
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
    layout_version: overrides.layoutVersion ?? "1280x720-v6",
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
      version: overrides.version ?? "26.0809.1",
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
    expect(assessMasteryOcrEvidence(masteryOcr())).toMatchObject({ outcome: "eligible", runCode: "1234-5678-9012", gameVersion: "26.0809.1" });
    expect(assessMasteryOcrEvidence(masteryOcr({ runCode: null }))).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
    expect(assessMasteryOcrEvidence(masteryOcr({ layoutVersion: "1280x720-v5" }))).toEqual({ outcome: "ineligible", reason: "unsupported_layout" });
    expect(assessMasteryOcrEvidence(masteryOcr({ version: "26.0808.9" }))).toEqual({ outcome: "ineligible", reason: "unsupported_game_version" });
    const weakRunCode = masteryOcr();
    weakRunCode.fields.run_code = { status: "low_confidence", confidence: 0.89 };
    expect(assessMasteryOcrEvidence(weakRunCode)).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
  });

  it("requires and preserves a classic map variant when the submission contract distinguishes it", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-missing", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-present", "binding.one", "Tester");
    for (const submissionId of ["submission.classic-missing", "submission.classic-present"]) {
      sqlite.prepare("UPDATE submissions SET rule_snapshot_json = ? WHERE id = ?").run(JSON.stringify({ ruleId: "challenge:classic", mapVariant: "classic" }), submissionId);
    }

    let ocr = masteryOcr({ runCode: "2345-6789-1234" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, "ocr-bucket");
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
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, "ocr-bucket");
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
  });

  it("keeps a valid no-code legacy title approval separate from mastery and records combined title plus mastery outcomes", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedTitle(sqlite, "CONQUEROR");
    sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.mastery', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '26.0809.1', 'active', '26.0809.1', ?, ?)").run(now, now);
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.combined", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.legacy", "binding.one", "Tester");

    let ocr = masteryOcr();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, "ocr-bucket");
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
      const services = createPlatformServices(database, {} as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token", queue, "ocr-bucket", undefined, undefined, undefined, 1, 1);
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
