import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

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
    async exec(sql: string) { sqlite.exec(sql); return []; },
    withSession() { return database; },
  } as unknown as D1Database;
  return { database, sqlite };
};

const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE player_accounts (
    id TEXT PRIMARY KEY NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
    normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
    banned_at INTEGER, banned_by TEXT, ban_reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE bindings (
    id TEXT PRIMARY KEY NOT NULL, identity_id TEXT NOT NULL, player_account_id TEXT NOT NULL,
    provider TEXT NOT NULL, group_open_id TEXT NOT NULL, member_open_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE qq_sessions (
    id TEXT PRIMARY KEY NOT NULL, attempt_id TEXT NOT NULL, group_open_id TEXT NOT NULL,
    member_open_id TEXT NOT NULL, environment TEXT NOT NULL, token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE submissions (
    id TEXT PRIMARY KEY NOT NULL, binding_id TEXT NOT NULL, status TEXT NOT NULL,
    challenge_type TEXT NOT NULL, challenge_id TEXT, target_map_id TEXT, gameplay_revision_id TEXT,
    map_name TEXT NOT NULL, difficulty TEXT, player_name TEXT, review_reason TEXT, grant_id TEXT,
    ocr_fail_count INTEGER NOT NULL DEFAULT 0, rule_snapshot_json TEXT, source_provider TEXT NOT NULL,
    source_conversation_id TEXT NOT NULL, source_message_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE ocr_results (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, request_id TEXT, attempt INTEGER NOT NULL,
    status TEXT NOT NULL, response_json TEXT, match_json TEXT, error_code TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE ocr_feedback_proposals (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, ocr_result_id TEXT NOT NULL,
    field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'achievement_titles')),
    original_value TEXT, feedback_type TEXT NOT NULL CHECK (feedback_type IN ('confirmed', 'corrected', 'passive_report')),
    prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
    proposed_value TEXT, model_version TEXT, layout_version TEXT, player_account_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (submission_id, ocr_result_id, field_key, player_account_id)
  );
  CREATE TABLE idempotency_keys (
    id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL,
    request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY NOT NULL, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE attachments (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, provider TEXT NOT NULL,
    external_attachment_id TEXT NOT NULL, content_type TEXT NOT NULL, byte_size INTEGER,
    sha256 TEXT, object_key TEXT, upload_status TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE submission_outcomes (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, outcome_key TEXT NOT NULL,
    outcome_type TEXT NOT NULL, status TEXT NOT NULL, entity_id TEXT, awarded_xp INTEGER NOT NULL DEFAULT 0,
    details_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE submission_reviews (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, decision TEXT NOT NULL,
    reason TEXT, reviewer TEXT NOT NULL, created_at INTEGER NOT NULL
  );
`);

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const highConfidenceOcr = {
  schema_version: "1", ok: true, model_version: "ocr-v1", layout_version: "layout-v2",
  fields: { map_name: { confidence: 0.97, status: "ok" }, difficulty: { confidence: 0.95, status: "ok" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.98, status: "ok" }, achievement_titles: { confidence: 0.9, status: "ok" } },
  data: { map_name: "萨摩亚", difficulty: "困难", viewer_player: "Player", challenge_completed: true, achievement_titles: ["征服者"] },
};

const uncertainDifficultyOcr = {
  ...highConfidenceOcr,
  fields: { ...highConfidenceOcr.fields, difficulty: { confidence: 0.55, status: "low_confidence" } },
};

const setup = async (options: { response?: unknown; playerStatus?: string; submissionStatus?: string; calibrationRate?: number } = {}) => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, options.calibrationRate ?? 0);
  const now = Date.now();
  const tokenHash = await sha256Hex("session-token");
  const otherTokenHash = await sha256Hex("other-session-token");
  sqlite.exec(`
    INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES
      ('player-owner', '1001', 'Owner', 'owner', 0, '${options.playerStatus ?? "active"}', 1, 1),
      ('player-other', '1002', 'Other', 'other', 0, 'active', 1, 1);
    INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES
      ('binding-owner', 'identity-1', 'player-owner', 'qq', 'group-1', 'member-owner', 'active', 1),
      ('binding-other', 'identity-2', 'player-other', 'qq', 'group-1', 'member-other', 'active', 1);
    INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES
      ('session-owner', 'attempt-1', 'group-1', 'member-owner', 'test', '${tokenHash}', ${now + 86_400_000}, 1),
      ('session-other', 'attempt-2', 'group-1', 'member-other', 'test', '${otherTokenHash}', ${now + 86_400_000}, 1);
    INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES
      ('submission-1', 'binding-owner', 'approved', 'map_title_achievement', 'challenge-1', '萨摩亚', '困难', 'Owner', 'qq', 'conv-1', 'msg-1', 1, 1),
      ('submission-2', 'binding-owner', '${options.submissionStatus ?? "approved"}', 'map_title_achievement', 'challenge-1', '萨摩亚', '困难', 'Owner', 'qq', 'conv-1', 'msg-2', 1, 1);
    INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at) VALUES
      ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '${JSON.stringify(options.response ?? highConfidenceOcr).replaceAll("'", "''")}', 1),
      ('ocr-2', 'submission-2', 'req-2', 1, 'ok', '${JSON.stringify(uncertainDifficultyOcr).replaceAll("'", "''")}', 1);
  `);
  return { database, sqlite, services };
};

const countProposals = (sqlite: DatabaseSync, submissionId = "submission-1") =>
  (sqlite.prepare("SELECT COUNT(*) AS count FROM ocr_feedback_proposals WHERE submission_id = ?").get(submissionId) as { count: number }).count;

describe("player OCR feedback", () => {
  it("records a confirmed prompt response with immutable recognition context", async () => {
    const { sqlite, services } = await setup({ response: uncertainDifficultyOcr });
    const response = await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-1");
    expect(response).toEqual({ contractVersion: "1", submissionId: "submission-2", recorded: [{ fieldKey: "difficulty", action: "confirmed", status: "submitted" }], alreadySubmitted: false });
    const row = sqlite.prepare("SELECT * FROM ocr_feedback_proposals").get() as Record<string, unknown>;
    expect(row.submission_id).toBe("submission-2");
    expect(row.ocr_result_id).toBe("ocr-2");
    expect(row.field_key).toBe("difficulty");
    expect(row.original_value).toBe("困难");
    expect(row.feedback_type).toBe("confirmed");
    expect(row.prompt_origin).toBe("uncertainty");
    expect(row.model_version).toBe("ocr-v1");
    expect(row.layout_version).toBe("layout-v2");
    expect(row.player_account_id).toBe("player-owner");
    expect(row.status).toBe("submitted");
    // The original OCR evidence is preserved byte-for-byte.
    const ocr = sqlite.prepare("SELECT response_json FROM ocr_results WHERE id = 'ocr-2'").get() as { response_json: string };
    expect(JSON.parse(ocr.response_json)).toEqual(uncertainDifficultyOcr);
  });

  it("stores a player correction without overwriting the recognized value", async () => {
    const { sqlite, services } = await setup({ response: uncertainDifficultyOcr });
    await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }, "session-token", "key-2");
    const row = sqlite.prepare("SELECT * FROM ocr_feedback_proposals").get() as Record<string, unknown>;
    expect(row.original_value).toBe("困难");
    expect(row.proposed_value).toBe("一般");
    expect(row.feedback_type).toBe("corrected");
  });

  it("accepts a passive correction when no prompt was generated and records origin passive", async () => {
    const { sqlite, services } = await setup();
    const response = await services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "普通" }] }, "session-token", "key-3");
    expect(response.recorded[0]?.status).toBe("submitted");
    const row = sqlite.prepare("SELECT * FROM ocr_feedback_proposals").get() as Record<string, unknown>;
    expect(row.prompt_origin).toBe("passive");
    expect(row.feedback_type).toBe("corrected");
  });

  it("rejects confirming a field that was not prompted", async () => {
    const { services } = await setup();
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-4")).rejects.toThrow("OCR_FEEDBACK_FIELD_NOT_PROMPTED");
  });

  it("enforces ownership: a player cannot give feedback on another player's submission", async () => {
    const { services } = await setup({ response: uncertainDifficultyOcr });
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "other-session-token", "key-5")).rejects.toThrow("SUBMISSION_NOT_FOUND");
  });

  it("keeps retries idempotent without creating duplicate equivalent proposals", async () => {
    const { sqlite, services } = await setup({ response: uncertainDifficultyOcr });
    const first = await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-6");
    expect(first.alreadySubmitted).toBe(false);
    const replay = await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-6");
    expect(replay.alreadySubmitted).toBe(true);
    const noKeyReplay = await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-7");
    expect(noKeyReplay.alreadySubmitted).toBe(true);
    expect(countProposals(sqlite, "submission-2")).toBe(1);
  });

  it("rejects a changed reuse of an idempotency key", async () => {
    const { services } = await setup({ response: uncertainDifficultyOcr });
    await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-8");
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }, "session-token", "key-8")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("keeps severe quality failures out of the annotation task path", async () => {
    const { services } = await setup({ response: { schema_version: "1", ok: false, fields: {}, data: {} } });
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }, "session-token", "key-9")).rejects.toThrow("OCR_FEEDBACK_UNAVAILABLE");
  });

  it("rejects feedback against a stale recognition prompt", async () => {
    const { services } = await setup({ response: uncertainDifficultyOcr });
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-1", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-10")).rejects.toThrow("OCR_PROMPT_STALE");
  });

  it("rejects feedback when the submission is in the resubmission path", async () => {
    const { services } = await setup({ response: uncertainDifficultyOcr, submissionStatus: "resubmission_required" });
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }, "session-token", "key-11")).rejects.toThrow("OCR_FEEDBACK_UNAVAILABLE");
  });

  it("does not mutate the submission, its review state, or mastery outcome", async () => {
    const { sqlite, services } = await setup({ response: uncertainDifficultyOcr });
    const before = sqlite.prepare("SELECT status, updated_at, grant_id FROM submissions WHERE id = 'submission-2'").get() as Record<string, unknown>;
    await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "corrected", proposedValue: "一般" }] }, "session-token", "key-12");
    const after = sqlite.prepare("SELECT status, updated_at, grant_id FROM submissions WHERE id = 'submission-2'").get() as Record<string, unknown>;
    expect(after).toEqual(before);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM submission_outcomes").get() as { count: number }).count).toBe(0);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews").get() as { count: number }).count).toBe(0);
  });

  it("derives the player feedback projection without leaking confidence or raw internals", async () => {
    const { services } = await setup({ response: uncertainDifficultyOcr });
    const detail = await services.getPlayerSubmission({ submissionId: "submission-2" }, "session-token");
    const serialized = JSON.stringify(detail);
    expect(detail.feedback?.mode).toBe("targeted");
    expect(detail.feedback?.promptFieldKeys).toEqual(["difficulty"]);
    expect(detail.feedback?.promptOrigin).toBe("uncertainty");
    expect(detail.feedback?.available).toBe(true);
    expect(detail.feedback?.submitted).toBe(false);
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain("responseJson");
    expect(serialized).not.toContain("0.9");
    // Only safe field keys are exposed.
    for (const item of detail.feedback?.fields ?? []) {
      expect(["map_name", "difficulty", "viewer_player", "challenge_completed", "achievement_titles"]).toContain(item.key);
    }
  });

  it("flips the submitted flag after feedback and hides other players' submissions", async () => {
    const { services } = await setup({ response: uncertainDifficultyOcr });
    const before = await services.getPlayerSubmission({ submissionId: "submission-2" }, "session-token");
    expect(before.feedback?.submitted).toBe(false);
    await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-13");
    const after = await services.getPlayerSubmission({ submissionId: "submission-2" }, "session-token");
    expect(after.feedback?.submitted).toBe(true);
    await expect(services.getPlayerSubmission({ submissionId: "submission-2" }, "other-session-token")).rejects.toThrow("SUBMISSION_NOT_FOUND");
  });

  it("supports calibration spot checks with a distinguishable origin", async () => {
    const { sqlite, services } = await setup({ calibrationRate: 1 });
    const detail = await services.getPlayerSubmission({ submissionId: "submission-1" }, "session-token");
    expect(detail.feedback?.mode).toBe("grouped");
    expect(detail.feedback?.promptOrigin).toBe("calibration");
    await services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", items: [{ fieldKey: "difficulty", action: "confirmed" }] }, "session-token", "key-14");
    const row = sqlite.prepare("SELECT prompt_origin FROM ocr_feedback_proposals").get() as { prompt_origin: string };
    expect(row.prompt_origin).toBe("calibration");
  });

  it("does not offer a calibration prompt at a zero rate", async () => {
    const { services } = await setup({ calibrationRate: 0 });
    const detail = await services.getPlayerSubmission({ submissionId: "submission-1" }, "session-token");
    expect(detail.feedback?.mode).toBe("none");
    expect(detail.feedback?.promptOrigin).toBeNull();
    expect(detail.feedback?.promptFieldKeys).toEqual([]);
    expect(detail.feedback?.available).toBe(true);
  });
});
