import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
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
  CREATE TABLE dataset_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    version INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    finalized_by TEXT,
    finalized_at INTEGER,
    note TEXT,
    eligibility_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE dataset_snapshot_annotations (
    snapshot_id TEXT NOT NULL REFERENCES dataset_snapshots(id),
    annotation_id TEXT NOT NULL REFERENCES reviewed_annotations(id),
    position INTEGER NOT NULL,
    evidence_object_key TEXT,
    evidence_content_type TEXT,
    evidence_available INTEGER NOT NULL DEFAULT 0 CHECK (evidence_available IN (0, 1)),
    PRIMARY KEY (snapshot_id, annotation_id)
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
`);

const maintainer = { actorType: "user" as const, subject: "maintainer-1", roles: ["maintainer"] as string[], provider: "test" };

type AnnotationSeed = {
  id: string;
  fieldKey: string;
  reviewedValue: string;
  normalizedValue?: string | null;
  originalOcrValue?: string | null;
  modelVersion?: string | null;
  layoutVersion?: string | null;
  reviewState?: "accepted" | "superseded";
  submissionId?: string;
};

const setup = async (annotations: AnnotationSeed[] = [], evidence: Record<string, { contentType: string; available?: boolean }> = { "evidence/1.png": { contentType: "image/png" } }) => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  const objects = new Map(Object.entries(evidence).map(([key, value]) => [key, value] as const));
  const fakeBucket = {
    head: vi.fn(async (key: string) => (objects.has(key) ? { key } : null)),
    get: vi.fn(async (key: string) => {
      const entry = objects.get(key);
      return entry ? { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, httpMetadata: { contentType: entry.contentType } } : null;
    }),
  } as unknown as R2Bucket;
  const services = createPlatformServices(database, fakeBucket);
  sqlite.exec(`
    INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player-1', '1', 'Player', 'player', 0, 'active', 1, 1);
    INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-1', 'member-1', 'active', 1);
    INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES
      ('submission-1', 'binding-1', 'approved', 'map_title_achievement', 'challenge-1', '萨摩亚', '困难', 'Player', 'qq', 'conv-1', 'msg-1', 1, 1),
      ('submission-2', 'binding-1', 'approved', 'map_title_achievement', 'challenge-1', '皇家赛道', '专家', 'Player', 'qq', 'conv-1', 'msg-2', 1, 1);
    INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at) VALUES
      ('ocr-1', 'submission-1', 'req-1', 1, 'ok', '{"schema_version":"1","ok":true,"model_version":"ocr-v1","layout_version":"layout-v2"}', 1),
      ('ocr-2', 'submission-2', 'req-2', 1, 'ok', '{"schema_version":"1","ok":true,"model_version":"ocr-v1","layout_version":"layout-v2"}', 1);
    INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES
      ('attachment-1', 'submission-1', 'portal', 'external-1', 'image/png', 1, 'hash-1', 'evidence/1.png', 'stored', 1),
      ('attachment-2', 'submission-2', 'portal', 'external-2', 'image/png', 1, 'hash-2', 'evidence/2.png', 'stored', 1);
  `);
  for (const [index, annotation] of annotations.entries()) {
    sqlite.prepare(`INSERT INTO reviewed_annotations (id, submission_id, ocr_result_id, proposal_id, field_key, original_ocr_value, model_version, layout_version, reviewed_value, normalized_value, player_account_id, player_proposed_value, prompt_origin, review_state, reviewed_by, reviewed_at, note, supersedes_annotation_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'player-1', ?, ?, ?, 'maintainer-1', ?, NULL, NULL, ?)`)
      .run(annotation.id, annotation.submissionId ?? (index % 2 === 0 ? "submission-1" : "submission-2"), index % 2 === 0 ? "ocr-1" : "ocr-2", annotation.fieldKey, annotation.originalOcrValue ?? "困难", annotation.modelVersion === undefined ? "ocr-v1" : annotation.modelVersion, annotation.layoutVersion === undefined ? "layout-v2" : annotation.layoutVersion, annotation.reviewedValue, annotation.normalizedValue ?? null, annotation.playerProposedValue ?? annotation.reviewedValue, annotation.promptOrigin ?? "uncertainty", annotation.reviewState ?? "accepted", 10 + index, 10 + index);
  }
  return { database, sqlite, services, fakeBucket };
};

const snapshotCount = (sqlite: DatabaseSync) => (sqlite.prepare("SELECT COUNT(*) AS count FROM dataset_snapshots").get() as { count: number }).count;
const memberCount = (sqlite: DatabaseSync, snapshotId: string) => (sqlite.prepare("SELECT COUNT(*) AS count FROM dataset_snapshot_annotations WHERE snapshot_id = ?").get(snapshotId) as { count: number }).count;

describe("immutable reviewed dataset snapshots", () => {
  it("creates a draft from eligible reviewed annotations with evidence references", async () => {
    const { sqlite, services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般", normalizedValue: "一般", originalOcrValue: "困难" },
      { id: "ann-2", fieldKey: "map_name", reviewedValue: "皇家赛道", originalOcrValue: "萨摩亚" },
    ]);
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-1");
    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(1);
    expect(draft.counts).toEqual({ eligibleCount: 2, excludedCount: 0, submissionCount: 2, annotationCount: 2 });
    expect(snapshotCount(sqlite)).toBe(1);
    expect(memberCount(sqlite, draft.datasetId)).toBe(2);
    const member = sqlite.prepare("SELECT * FROM dataset_snapshot_annotations ORDER BY position LIMIT 1").get() as Record<string, unknown>;
    expect(member.evidence_object_key).toBe("evidence/1.png");
    expect(member.evidence_available).toBe(1);
    expect(member.position).toBe(0);
  });

  it("reports validation/exclusion results for missing provenance or unavailable evidence", async () => {
    const { sqlite, services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" },
      { id: "ann-2", fieldKey: "map_name", reviewedValue: "皇家赛道", modelVersion: null },
      { id: "ann-3", fieldKey: "viewer_player", reviewedValue: "Player", layoutVersion: null },
    ]);
    // ann-3's submission has evidence; make ann-2 and ann-3 share submission-2 with an
    // object key that no longer exists to force a missing-evidence exclusion.
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-2");
    expect(draft.counts.eligibleCount).toBe(1);
    expect(draft.counts.excludedCount).toBe(2);
    const detail = await services.getAdminDataset({ datasetId: draft.datasetId }, maintainer);
    const reasons = detail.exclusions.map((exclusion) => exclusion.reason).sort();
    expect(reasons).toEqual(["missing_layout_version", "missing_model_version"]);
    expect(detail.members.map((member) => member.annotationId)).toEqual(["ann-1"]);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM dataset_snapshot_annotations").get() as { count: number }).count).toBe(1);
  });

  it("freezes membership on finalization and excludes already-snapshotted annotations from later drafts", async () => {
    const { services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" },
      { id: "ann-2", fieldKey: "map_name", reviewedValue: "皇家赛道" },
    ]);
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-3");
    const finalized = await services.finalizeAdminDataset({ datasetId: draft.datasetId }, maintainer, "key-4");
    expect(finalized.status).toBe("finalized");
    await expect(services.finalizeAdminDataset({ datasetId: draft.datasetId }, maintainer, "key-5")).rejects.toThrow("DATASET_ALREADY_FINALIZED");
    // New annotations are accepted, but members of the finalized snapshot are excluded.
    const second = await services.createAdminDatasetDraft({}, maintainer, "key-6");
    expect(second.version).toBe(2);
    expect(second.counts.excludedCount).toBe(2);
    expect(second.counts.eligibleCount).toBe(0);
    const detail = await services.getAdminDataset({ datasetId: second.datasetId }, maintainer);
    expect(detail.exclusions.map((exclusion) => exclusion.reason)).toEqual(["already_snapshotted", "already_snapshotted"]);
  });

  it("keeps later corrections out of finalized snapshots without mutating them", async () => {
    const { sqlite, services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" },
    ]);
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-7");
    await services.finalizeAdminDataset({ datasetId: draft.datasetId }, maintainer, "key-8");
    // Supersede the annotation that is already in the finalized snapshot.
    sqlite.prepare("UPDATE reviewed_annotations SET review_state = 'superseded' WHERE id = 'ann-1'").run();
    const frozen = sqlite.prepare("SELECT reviewed_value, review_state FROM reviewed_annotations WHERE id = 'ann-1'").get() as { reviewed_value: string; review_state: string };
    expect(frozen.reviewed_value).toBe("一般");
    const snapshot = sqlite.prepare("SELECT * FROM dataset_snapshots").get() as { status: string };
    expect(snapshot.status).toBe("finalized");
    // The corrected truth is eligible only for a later snapshot.
    const later = await services.createAdminDatasetDraft({}, maintainer, "key-9");
    expect(later.counts.eligibleCount).toBe(0);
  });

  it("distinguishes exact transcription, normalized value, and original OCR prediction", async () => {
    const { services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "普通", normalizedValue: "一般", originalOcrValue: "困难" },
    ]);
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-10");
    const detail = await services.getAdminDataset({ datasetId: draft.datasetId }, maintainer);
    const member = detail.members[0]!;
    expect(member.reviewedValue).toBe("普通");
    expect(member.normalizedValue).toBe("一般");
    expect(member.originalOcrValue).toBe("困难");
    expect(member.modelVersion).toBe("ocr-v1");
    expect(member.layoutVersion).toBe("layout-v2");
  });

  it("serves the private versioned OCRKit contract without identity or risk internals", async () => {
    const { services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般", normalizedValue: "一般", originalOcrValue: "困难" },
    ]);
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-11");
    await services.finalizeAdminDataset({ datasetId: draft.datasetId }, maintainer, "key-12");
    const dataset = await services.getOcrkitDataset({ version: draft.version });
    const serialized = JSON.stringify(dataset);
    expect(dataset.snapshot.finalizedAt).toBeGreaterThan(0);
    expect(dataset.members[0]?.evidence).toEqual({ id: "ann-1", available: true, contentType: "image/png" });
    expect(serialized).not.toContain("player");
    expect(serialized).not.toContain("qq");
    expect(serialized).not.toContain("grant");
    expect(serialized).not.toContain("mastery");
    expect(serialized).not.toContain("submission");
    expect(serialized).not.toContain("evidence_object_key");
    // Drafts are never consumable.
    const laterDraft = await services.createAdminDatasetDraft({}, maintainer, "key-13");
    await expect(services.getOcrkitDataset({ version: laterDraft.version })).rejects.toThrow("DATASET_NOT_FINALIZED");
  });

  it("delivers evidence only for snapshot members and reports missing source explicitly", async () => {
    const { services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" },
      { id: "ann-2", fieldKey: "map_name", reviewedValue: "皇家赛道" },
    ]);
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-14");
    await services.finalizeAdminDataset({ datasetId: draft.datasetId }, maintainer, "key-15");
    const evidence = await services.getOcrkitDatasetEvidence({ version: draft.version, annotationId: "ann-1" });
    expect(new Uint8Array(evidence.body)).toEqual(new Uint8Array([1, 2, 3]));
    // A member of the snapshot but with a deleted object is explicit, never substituted.
    const unavailable = await services.getOcrkitDatasetEvidence({ version: draft.version, annotationId: "ann-2" }).catch((error: Error) => error.message);
    expect(unavailable).toBe("EVIDENCE_UNAVAILABLE");
    // Non-members cannot read evidence.
    await expect(services.getOcrkitDatasetEvidence({ version: draft.version, annotationId: "ann-999" })).rejects.toThrow("EVIDENCE_NOT_FOUND");
  });

  it("keeps repeated reads and download retries safe without altering snapshot state", async () => {
    const { sqlite, services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" },
    ]);
    const draft = await services.createAdminDatasetDraft({}, maintainer, "key-16");
    await services.finalizeAdminDataset({ datasetId: draft.datasetId }, maintainer, "key-17");
    const first = await services.getOcrkitDataset({ version: draft.version });
    const second = await services.getOcrkitDataset({ version: draft.version });
    expect(second).toEqual(first);
    await services.getOcrkitDatasetEvidence({ version: draft.version, annotationId: "ann-1" });
    await services.getOcrkitDatasetEvidence({ version: draft.version, annotationId: "ann-1" });
    const row = sqlite.prepare("SELECT status, finalized_at FROM dataset_snapshots").get() as { status: string; finalized_at: number };
    expect(row.status).toBe("finalized");
    expect(row.finalized_at).toBeGreaterThan(0);
    expect(memberCount(sqlite, draft.datasetId)).toBe(1);
  });

  it("keeps draft creation and finalization idempotent", async () => {
    const { sqlite, services } = await setup([{ id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" }]);
    const first = await services.createAdminDatasetDraft({}, maintainer, "key-18");
    const replay = await services.createAdminDatasetDraft({}, maintainer, "key-18");
    expect(replay).toEqual(first);
    expect(snapshotCount(sqlite)).toBe(1);
    const finalized = await services.finalizeAdminDataset({ datasetId: first.datasetId }, maintainer, "key-19");
    const finalizedReplay = await services.finalizeAdminDataset({ datasetId: first.datasetId }, maintainer, "key-19");
    expect(finalizedReplay).toEqual(finalized);
    expect((sqlite.prepare("SELECT status FROM dataset_snapshots").get() as { status: string }).status).toBe("finalized");
  });

  it("assigns monotonic versions across drafts", async () => {
    const { services } = await setup([
      { id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" },
      { id: "ann-2", fieldKey: "map_name", reviewedValue: "皇家赛道" },
    ]);
    const first = await services.createAdminDatasetDraft({}, maintainer, "key-20");
    const second = await services.createAdminDatasetDraft({}, maintainer, "key-21");
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
  });

  it("lists datasets with their eligibility counts", async () => {
    const { services } = await setup([{ id: "ann-1", fieldKey: "difficulty", reviewedValue: "一般" }]);
    await services.createAdminDatasetDraft({ note: "初始采样" }, maintainer, "key-22");
    const list = await services.listAdminDatasets({ page: 1, pageSize: 20 }, maintainer);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ version: 1, status: "draft", note: "初始采样", counts: { eligibleCount: 1, excludedCount: 0 } });
  });
});
