import {
  attachmentsSchema,
  auditEventsRequiredIdSchema,
  bindingsSchema,
  idempotencyKeysRequiredIdSchema,
  ocrAccuracyFeedbackSchema,
  ocrResultsSchema,
  playerAccountsSchema,
  portalSessionsSchema,
  submissionOutcomesSchema,
  submissionReviewsSchema,
  submissionsSchema,
} from "../test/schema";
import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { hashRequest } from "./portal-session";

const createD1 = () => createTestD1({ foreignKeys: true });
const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  ${playerAccountsSchema}
  ${bindingsSchema}
  ${portalSessionsSchema}
  ${submissionsSchema}
  ${ocrResultsSchema}
  ${ocrAccuracyFeedbackSchema}
  CREATE TABLE ocr_feedback_proposals (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, ocr_result_id TEXT NOT NULL,
    field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'map_variant', 'achievement_titles')),
    original_value TEXT, feedback_type TEXT NOT NULL CHECK (feedback_type IN ('confirmed', 'corrected', 'passive_report')),
    prompt_origin TEXT CHECK (prompt_origin IN ('uncertainty', 'conflict', 'grouped', 'calibration', 'passive')),
    proposed_value TEXT, model_version TEXT, layout_version TEXT, player_account_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (submission_id, ocr_result_id, field_key, player_account_id)
  );
  ${idempotencyKeysRequiredIdSchema}
  ${auditEventsRequiredIdSchema}
  ${attachmentsSchema}
  ${submissionOutcomesSchema}
  ${submissionReviewsSchema}
`);

const highConfidenceOcr = {
  schema_version: "1", ok: true, model_version: "ocr-v1", layout_version: "layout-v2",
  fields: { map_name: { confidence: 0.97, status: "ok" }, difficulty: { confidence: 0.95, status: "ok" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.98, status: "ok" }, map_variant: { confidence: 0.96, status: "ok" }, achievement_titles: { confidence: 0.9, status: "ok" } },
  data: { map_name: "萨摩亚", difficulty: "困难", viewer_player: "Player", challenge_completed: true, map_variant: "classic", achievement_titles: ["征服者"] },
};

const setup = async (options: { response?: unknown; playerStatus?: string; submissionStatus?: string } = {}) => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, "https://evidence.owbastion.codes");
  const now = Date.now();
  const tokenHash = await hashRequest("session-token");
  const otherTokenHash = await hashRequest("other-session-token");
  sqlite.exec(`
    INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES
      ('player-owner', '1001', 'Owner', 'owner', 0, '${options.playerStatus ?? "active"}', 1, 1),
      ('player-other', '1002', 'Other', 'other', 0, 'active', 1, 1);
    INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES
      ('binding-owner', 'identity-1', 'player-owner', 'qq', 'group-1', 'member-owner', 'active', 1),
      ('binding-other', 'identity-2', 'player-other', 'qq', 'group-1', 'member-other', 'active', 1);
    INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES
      ('session-owner', 'player-owner', '${tokenHash}', ${now + 86_400_000}),
      ('session-other', 'player-other', '${otherTokenHash}', ${now + 86_400_000});
    INSERT INTO submissions (id, player_account_id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES
      ('submission-1', 'player-owner', 'binding-owner', 'approved', 'map_title_achievement', 'challenge-1', '萨摩亚', '困难', 'Owner', 'qq', 'conv-1', 'msg-1', 1, 1),
      ('submission-2', 'player-owner', 'binding-owner', '${options.submissionStatus ?? "approved"}', 'map_title_achievement', 'challenge-1', '萨摩亚', '困难', 'Owner', 'qq', 'conv-1', 'msg-2', 1, 1);
    INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at) VALUES
      ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '${JSON.stringify(options.response ?? highConfidenceOcr).replaceAll("'", "''")}', 1),
      ('ocr-2', 'submission-2', 'req-2', 1, 'ok', '${JSON.stringify(highConfidenceOcr).replaceAll("'", "''")}', 1);
  `);
  return { database, sqlite, services };
};

const maintainer = { actorType: "user" as const, subject: "maintainer-1", roles: ["maintainer"], provider: "test" };

const accuracyRows = (sqlite: DatabaseSync) => sqlite.prepare("SELECT submission_id, ocr_result_id, accuracy, marked_by, marked_by_type FROM ocr_accuracy_feedback ORDER BY created_at").all() as Array<Record<string, unknown>>;

describe("OCR accuracy feedback", () => {
  it("returns the unlisted CDN evidence URL in player detail", async () => {
    const { services, sqlite } = await setup();
    sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, object_key, upload_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("attachment-evidence", "submission-1", "portal", "upload-1", "image/png", "uploads/submissions/submission-1/evidence.png", "stored", 1);

    const detail = await services.getPlayerSubmission({ submissionId: "submission-1" }, "session-token");
    expect(detail.evidenceUrl).toBe("https://evidence.owbastion.codes/uploads/submissions/submission-1/evidence.png");
  });

  it("records a player accuracy mark without transcription content", async () => {
    const { sqlite, services } = await setup();
    const response = await services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate" }, "session-token", "key-1");
    expect(response).toEqual({ contractVersion: "1", submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate", alreadySubmitted: false });
    const [row] = accuracyRows(sqlite);
    expect(row).toMatchObject({ submission_id: "submission-1", ocr_result_id: "ocr-1", accuracy: "accurate", marked_by: "1001", marked_by_type: "player" });
    // The original OCR evidence is preserved byte-for-byte.
    const ocr = sqlite.prepare("SELECT response_json FROM ocr_results WHERE id = 'ocr-1'").get() as { response_json: string };
    expect(JSON.parse(ocr.response_json)).toEqual(highConfidenceOcr);
    // The legacy proposal table receives nothing.
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM ocr_feedback_proposals").get() as { count: number }).count).toBe(0);
    const audit = sqlite.prepare("SELECT payload_json FROM audit_events WHERE operation = 'ocr.accuracy.marked'").get() as { payload_json: string };
    expect(JSON.parse(audit.payload_json)).toEqual({ ocrResultId: "ocr-1", accuracy: "accurate" });
  });

  it("enforces ownership: a player cannot mark another player's submission", async () => {
    const { services } = await setup();
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", accuracy: "inaccurate" }, "other-session-token", "key-2")).rejects.toThrow("SUBMISSION_NOT_FOUND");
  });

  it("keeps retries idempotent without creating duplicate rows", async () => {
    const { sqlite, services } = await setup();
    const first = await services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate" }, "session-token", "key-3");
    expect(first.alreadySubmitted).toBe(false);
    const replay = await services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate" }, "session-token", "key-3");
    expect(replay.alreadySubmitted).toBe(true);
    expect(accuracyRows(sqlite)).toHaveLength(1);
  });

  it("rejects a changed reuse of an idempotency key", async () => {
    const { services } = await setup();
    await services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate" }, "session-token", "key-4");
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "inaccurate" }, "session-token", "key-4")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("rejects feedback against a stale recognition result", async () => {
    const { services } = await setup();
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-1", accuracy: "accurate" }, "session-token", "key-5")).rejects.toThrow("OCR_PROMPT_STALE");
  });

  it("rejects feedback when the submission is in the resubmission path", async () => {
    const { services } = await setup({ submissionStatus: "resubmission_required" });
    await expect(services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", accuracy: "inaccurate" }, "session-token", "key-6")).rejects.toThrow("OCR_FEEDBACK_UNAVAILABLE");
  });

  it("does not mutate the submission, its review state, or mastery outcome", async () => {
    const { sqlite, services } = await setup();
    const before = sqlite.prepare("SELECT status, updated_at, grant_id FROM submissions WHERE id = 'submission-2'").get() as Record<string, unknown>;
    await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", accuracy: "inaccurate" }, "session-token", "key-7");
    const after = sqlite.prepare("SELECT status, updated_at, grant_id FROM submissions WHERE id = 'submission-2'").get() as Record<string, unknown>;
    expect(after).toEqual(before);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM submission_outcomes").get() as { count: number }).count).toBe(0);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews").get() as { count: number }).count).toBe(0);
  });

  it("exposes only the current mark in the player detail projection", async () => {
    const { services } = await setup();
    const before = await services.getPlayerSubmission({ submissionId: "submission-2" }, "session-token");
    expect(before.feedback).toEqual({ ocrResultId: "ocr-2", accuracy: null });
    await services.submitPlayerOcrFeedback({ submissionId: "submission-2", ocrResultId: "ocr-2", accuracy: "inaccurate" }, "session-token", "key-8");
    const after = await services.getPlayerSubmission({ submissionId: "submission-2" }, "session-token");
    expect(after.feedback).toEqual({ ocrResultId: "ocr-2", accuracy: "inaccurate" });
    const serialized = JSON.stringify(after);
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain("responseJson");
  });

  it("records a maintainer mark on the shared row and lets the latest writer win", async () => {
    const { sqlite, services } = await setup();
    await services.submitPlayerOcrFeedback({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate" }, "session-token", "key-9");
    const response = await services.submitAdminOcrAccuracy({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "inaccurate" }, maintainer, "admin-key-1");
    expect(response).toEqual({ contractVersion: "1", submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "inaccurate", alreadySubmitted: false });
    const [row] = accuracyRows(sqlite);
    expect(row).toMatchObject({ accuracy: "inaccurate", marked_by: "maintainer-1", marked_by_type: "maintainer" });
    expect(accuracyRows(sqlite)).toHaveLength(1);
  });

  it("keeps maintainer retries idempotent", async () => {
    const { sqlite, services } = await setup();
    await services.submitAdminOcrAccuracy({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate" }, maintainer, "admin-key-2");
    const replay = await services.submitAdminOcrAccuracy({ submissionId: "submission-1", ocrResultId: "ocr-1", accuracy: "accurate" }, maintainer, "admin-key-2");
    expect(replay.alreadySubmitted).toBe(true);
    expect(accuracyRows(sqlite)).toHaveLength(1);
  });

  it("rejects maintainer marks on stale or foreign recognition results", async () => {
    const { services } = await setup();
    await expect(services.submitAdminOcrAccuracy({ submissionId: "submission-2", ocrResultId: "ocr-1", accuracy: "accurate" }, maintainer, "admin-key-3")).rejects.toThrow("OCR_PROMPT_STALE");
    await expect(services.submitAdminOcrAccuracy({ submissionId: "missing", ocrResultId: "ocr-1", accuracy: "accurate" }, maintainer, "admin-key-4")).rejects.toThrow("SUBMISSION_NOT_FOUND");
  });
});
