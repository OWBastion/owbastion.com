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
    review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'accepted', 'rejected')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (submission_id, ocr_result_id, field_key, player_account_id)
  );
  CREATE TABLE reviewed_annotations (
    id TEXT PRIMARY KEY NOT NULL,
    submission_id TEXT NOT NULL,
    ocr_result_id TEXT NOT NULL,
    proposal_id TEXT REFERENCES ocr_feedback_proposals(id),
    field_key TEXT NOT NULL CHECK (field_key IN ('map_name', 'difficulty', 'viewer_player', 'challenge_completed', 'achievement_titles')),
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
    supersedes_annotation_id TEXT REFERENCES reviewed_annotations(id),
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX reviewed_annotations_proposal_idx ON reviewed_annotations(proposal_id) WHERE proposal_id IS NOT NULL;
  CREATE UNIQUE INDEX reviewed_annotations_active_field_idx ON reviewed_annotations(submission_id, ocr_result_id, field_key) WHERE review_state = 'accepted';
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

const ocrResponse = (overrides: Record<string, unknown> = {}) => ({
  schema_version: "1", ok: true, model_version: "ocr-v1", layout_version: "layout-v2",
  fields: { map_name: { confidence: 0.97, status: "ok" }, difficulty: { confidence: 0.55, status: "low_confidence" }, viewer_player: { confidence: 0.96, status: "ok" }, challenge_completed: { confidence: 0.98, status: "ok" }, achievement_titles: { confidence: 0.9, status: "ok" } },
  data: { map_name: "萨摩亚", difficulty: "困难", viewer_player: "Player", challenge_completed: true, achievement_titles: ["征服者"] },
  ...overrides,
});

type ProposalSeed = {
  id: string;
  fieldKey: string;
  feedbackType: "confirmed" | "corrected" | "passive_report";
  promptOrigin: string | null;
  proposedValue: string | null;
  submissionId?: string;
  ocrResultId?: string;
  playerAccountId?: string;
};

const setup = async (proposals: ProposalSeed[] = []) => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  const services = createPlatformServices(database);
  const tokenHash = await sha256Hex("session-token");
  sqlite.exec(`
    INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES
      ('player-owner', '1001', 'Owner', 'owner', 0, 'active', 1, 1),
      ('player-other', '1002', 'Other', 'other', 0, 'active', 1, 1);
    INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES
      ('binding-owner', 'identity-1', 'player-owner', 'qq', 'group-1', 'member-owner', 'active', 1);
    INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES
      ('session-owner', 'attempt-1', 'group-1', 'member-owner', 'test', '${tokenHash}', ${Date.now() + 86_400_000}, 1);
    INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES
      ('submission-1', 'binding-owner', 'approved', 'map_title_achievement', 'challenge-1', '萨摩亚', '困难', 'Owner', 'qq', 'conv-1', 'msg-1', 1, 1),
      ('submission-2', 'binding-owner', 'approved', 'map_title_achievement', 'challenge-1', '萨摩亚', '困难', 'Owner', 'qq', 'conv-1', 'msg-2', 1, 1);
    INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at) VALUES
      ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '${JSON.stringify(ocrResponse()).replaceAll("'", "''")}', 1),
      ('ocr-2', 'submission-2', 'req-2', 1, 'ok', '${JSON.stringify(ocrResponse()).replaceAll("'", "''")}', 1);
  `);
  for (const [index, proposal] of proposals.entries()) {
    sqlite.prepare(`INSERT INTO ocr_feedback_proposals (id, submission_id, ocr_result_id, field_key, original_value, feedback_type, prompt_origin, proposed_value, model_version, layout_version, player_account_id, status, review_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 'pending', ?, ?)`)
      .run(proposal.id, proposal.submissionId ?? "submission-1", proposal.ocrResultId ?? "ocr-1", proposal.fieldKey, "困难", proposal.feedbackType, proposal.promptOrigin, proposal.proposedValue, "ocr-v1", "layout-v2", proposal.playerAccountId ?? "player-owner", 10 + index, 10 + index);
  }
  return { database, sqlite, services };
};

const maintainer = { actorType: "user" as const, subject: "maintainer-1", roles: ["maintainer"] as string[], provider: "test" };

const annotationCount = (sqlite: DatabaseSync) => (sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations").get() as { count: number }).count;
const proposalState = (sqlite: DatabaseSync, id: string) => (sqlite.prepare("SELECT review_state FROM ocr_feedback_proposals WHERE id = ?").get(id) as { review_state: string }).review_state;

describe("maintainer annotation review", () => {
  it("accepts a proposal into a reviewed annotation with full provenance", async () => {
    const { sqlite, services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    const response = await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-1");
    expect(response).toEqual({ contractVersion: "1", proposalId: "proposal-1", reviewState: "accepted", annotationId: expect.any(String) });
    expect(annotationCount(sqlite)).toBe(1);
    expect(proposalState(sqlite, "proposal-1")).toBe("accepted");
    const row = sqlite.prepare("SELECT * FROM reviewed_annotations").get() as Record<string, unknown>;
    expect(row.submission_id).toBe("submission-1");
    expect(row.ocr_result_id).toBe("ocr-1");
    expect(row.proposal_id).toBe("proposal-1");
    expect(row.field_key).toBe("difficulty");
    expect(row.original_ocr_value).toBe("困难");
    expect(row.model_version).toBe("ocr-v1");
    expect(row.layout_version).toBe("layout-v2");
    expect(row.reviewed_value).toBe("一般");
    expect(row.player_proposed_value).toBe("一般");
    expect(row.player_account_id).toBe("player-owner");
    expect(row.prompt_origin).toBe("uncertainty");
    expect(row.reviewed_by).toBe("maintainer-1");
    expect(row.review_state).toBe("accepted");
  });

  it("accepts an edited transcription and keeps the business-normalized value distinct", async () => {
    const { sqlite, services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "edit_accept", reviewedValue: "普通", normalizedValue: "一般", note: "标准化" }, maintainer, "key-2");
    const row = sqlite.prepare("SELECT * FROM reviewed_annotations").get() as Record<string, unknown>;
    expect(row.reviewed_value).toBe("普通");
    expect(row.normalized_value).toBe("一般");
    expect(row.player_proposed_value).toBe("一般");
    expect(row.original_ocr_value).toBe("困难");
    expect(row.note).toBe("标准化");
  });

  it("rejects a proposal without a mandatory reason and creates no annotation", async () => {
    const { sqlite, services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    const response = await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "reject" }, maintainer, "key-3");
    expect(response).toEqual({ contractVersion: "1", proposalId: "proposal-1", reviewState: "rejected", annotationId: null });
    expect(annotationCount(sqlite)).toBe(0);
    expect(proposalState(sqlite, "proposal-1")).toBe("rejected");
  });

  it("creates a reviewed annotation directly for an eligible OCR field without a proposal", async () => {
    const { sqlite, services } = await setup();
    const response = await services.createAdminReviewedAnnotation({ contractVersion: "1", submissionId: "submission-2", ocrResultId: "ocr-2", fieldKey: "map_name", reviewedValue: "皇家赛道" }, maintainer, "key-4");
    expect(response.supersededAnnotationId).toBeNull();
    const row = sqlite.prepare("SELECT * FROM reviewed_annotations").get() as Record<string, unknown>;
    expect(row.proposal_id).toBeNull();
    expect(row.submission_id).toBe("submission-2");
    expect(row.original_ocr_value).toBe("萨摩亚");
    expect(row.reviewed_value).toBe("皇家赛道");
    expect(row.reviewed_by).toBe("maintainer-1");
  });

  it("orders the queue by priority: corrections and calibration failures above confirmations", async () => {
    const { services } = await setup([
      { id: "p-confirm", submissionId: "submission-1", ocrResultId: "ocr-1", fieldKey: "difficulty", feedbackType: "confirmed", promptOrigin: "uncertainty", proposedValue: null },
      { id: "p-correction", submissionId: "submission-2", ocrResultId: "ocr-2", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" },
      { id: "p-calibration", submissionId: "submission-1", ocrResultId: "ocr-1", fieldKey: "map_name", feedbackType: "corrected", promptOrigin: "calibration", proposedValue: "皇家赛道" },
      { id: "p-uncertain", submissionId: "submission-2", ocrResultId: "ocr-2", fieldKey: "viewer_player", feedbackType: "corrected", promptOrigin: "conflict", proposedValue: "Another" },
    ]);
    const list = await services.listAdminAnnotationProposals({ page: 1, pageSize: 20 }, maintainer);
    const order = list.items.map((item) => item.proposalId);
    expect(order).toEqual(["p-calibration", "p-correction", "p-uncertain", "p-confirm"]);
    expect(list.items.find((item) => item.proposalId === "p-calibration")?.priority.category).toBe("calibration_failure");
    expect(list.items.find((item) => item.proposalId === "p-confirm")?.priority.category).toBe("confirmation");
  });

  it("filters the queue by state, field, kind, and prompt origin", async () => {
    const { services } = await setup([
      { id: "p-confirm", fieldKey: "difficulty", feedbackType: "confirmed", promptOrigin: "uncertainty", proposedValue: null },
      { id: "p-correction", fieldKey: "viewer_player", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "Another" },
    ]);
    const corrections = await services.listAdminAnnotationProposals({ page: 1, pageSize: 20, kind: "correction" }, maintainer);
    expect(corrections.items.map((item) => item.proposalId)).toEqual(["p-correction"]);
    const confirmations = await services.listAdminAnnotationProposals({ page: 1, pageSize: 20, kind: "confirmation" }, maintainer);
    expect(confirmations.items.map((item) => item.proposalId)).toEqual(["p-confirm"]);
    const byField = await services.listAdminAnnotationProposals({ page: 1, pageSize: 20, fieldKey: "difficulty" }, maintainer);
    expect(byField.items.map((item) => item.proposalId)).toEqual(["p-confirm"]);
    const byOrigin = await services.listAdminAnnotationProposals({ page: 1, pageSize: 20, promptOrigin: "uncertainty", state: "pending" }, maintainer);
    expect(byOrigin.items).toHaveLength(2);
  });

  it("keeps annotation decisions idempotent and audited", async () => {
    const { sqlite, services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    const first = await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-5");
    const replay = await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-5");
    expect(replay).toEqual(first);
    expect(annotationCount(sqlite)).toBe(1);
    // A second decision under a different key is rejected.
    await expect(services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "reject" }, maintainer, "key-6")).rejects.toThrow("ANNOTATION_PROPOSAL_ALREADY_DECIDED");
    const audits = sqlite.prepare("SELECT operation FROM audit_events").all() as Array<{ operation: string }>;
    expect(audits.map((entry) => entry.operation)).toContain("annotation.proposal.accepted");
  });

  it("supersedes a previous accepted annotation without mutating its content", async () => {
    const { sqlite, services } = await setup([
      { id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" },
      { id: "proposal-2", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "普通", playerAccountId: "player-other" },
    ]);
    await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-7");
    const second = await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-2", action: "accept" }, maintainer, "key-8");
    expect(second.annotationId).not.toBeNull();
    const rows = sqlite.prepare("SELECT id, reviewed_value, review_state, supersedes_annotation_id FROM reviewed_annotations ORDER BY created_at").all() as Array<{ id: string; reviewed_value: string; review_state: string; supersedes_annotation_id: string | null }>;
    expect(rows).toHaveLength(2);
    const superseded = rows.find((row) => row.reviewed_value === "一般");
    expect(superseded?.review_state).toBe("superseded");
    expect(superseded?.reviewed_value).toBe("一般");
    const active = rows.find((row) => row.reviewed_value === "普通");
    expect(active?.review_state).toBe("accepted");
    // The auditable supersession chain is retained on the new annotation.
    expect(active?.supersedes_annotation_id).toBe(superseded?.id);
  });

  it("never mutates the submission, review, or mastery state", async () => {
    const { sqlite, services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    const before = sqlite.prepare("SELECT status, updated_at, grant_id FROM submissions WHERE id = 'submission-1'").get() as Record<string, unknown>;
    await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-9");
    const after = sqlite.prepare("SELECT status, updated_at, grant_id FROM submissions WHERE id = 'submission-1'").get() as Record<string, unknown>;
    expect(after).toEqual(before);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM submission_outcomes").get() as { count: number }).count).toBe(0);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews").get() as { count: number }).count).toBe(0);
  });

  it("keeps original OCR evidence, player feedback, and reviewed truth separately traceable", async () => {
    const { sqlite, services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-10");
    const ocr = JSON.parse((sqlite.prepare("SELECT response_json FROM ocr_results WHERE id = 'ocr-1'").get() as { response_json: string }).response_json) as { data: { difficulty: string } };
    expect(ocr.data.difficulty).toBe("困难");
    const proposal = sqlite.prepare("SELECT original_value, proposed_value FROM ocr_feedback_proposals WHERE id = 'proposal-1'").get() as { original_value: string; proposed_value: string };
    expect(proposal.original_value).toBe("困难");
    expect(proposal.proposed_value).toBe("一般");
    const annotation = sqlite.prepare("SELECT original_ocr_value, player_proposed_value, reviewed_value FROM reviewed_annotations").get() as Record<string, string>;
    expect(annotation.original_ocr_value).toBe("困难");
    expect(annotation.player_proposed_value).toBe("一般");
    expect(annotation.reviewed_value).toBe("一般");
  });

  it("lists reviewed annotations with provenance filters", async () => {
    const { services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-11");
    const list = await services.listAdminReviewedAnnotations({ page: 1, pageSize: 20 }, maintainer);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ fieldKey: "difficulty", reviewedValue: "一般", reviewState: "accepted", reviewedBy: "maintainer-1", submissionMapName: "萨摩亚" });
    const byState = await services.listAdminReviewedAnnotations({ page: 1, pageSize: 20, state: "superseded" }, maintainer);
    expect(byState.total).toBe(0);
  });

  it("does not expose annotation state through player-facing submission reads", async () => {
    const { services } = await setup([{ id: "proposal-1", fieldKey: "difficulty", feedbackType: "corrected", promptOrigin: "uncertainty", proposedValue: "一般" }]);
    await services.decideAdminAnnotationProposal({ contractVersion: "1", proposalId: "proposal-1", action: "accept" }, maintainer, "key-12");
    const detail = await services.getPlayerSubmission({ submissionId: "submission-1" }, "session-token");
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("annotation");
    expect(serialized).not.toContain("reviewed");
    expect(serialized).not.toContain("maintainer");
  });
});
