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
  CREATE TABLE submissions (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT, binding_id TEXT, status TEXT NOT NULL,
    challenge_type TEXT NOT NULL, challenge_id TEXT, target_map_id TEXT, gameplay_revision_id TEXT,
    map_name TEXT NOT NULL, difficulty TEXT, player_name TEXT, review_reason TEXT, grant_id TEXT,
    ocr_fail_count INTEGER NOT NULL DEFAULT 0, rule_snapshot_json TEXT, source_provider TEXT NOT NULL,
    source_conversation_id TEXT NOT NULL, source_message_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE ocr_results (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, request_id TEXT, attempt INTEGER NOT NULL,
    status TEXT NOT NULL, response_json TEXT, match_json TEXT, error_code TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE attachments (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, provider TEXT NOT NULL,
    external_attachment_id TEXT NOT NULL, content_type TEXT NOT NULL, byte_size INTEGER,
    sha256 TEXT, object_key TEXT, upload_status TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE ocr_accuracy_feedback (
    id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, ocr_result_id TEXT NOT NULL,
    accuracy TEXT NOT NULL CHECK (accuracy IN ('accurate', 'inaccurate')),
    marked_by TEXT NOT NULL, marked_by_type TEXT NOT NULL CHECK (marked_by_type IN ('player', 'maintainer')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (submission_id, ocr_result_id)
  );
  CREATE TABLE screenshot_sets (
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
  CREATE TABLE screenshot_set_members (
    set_id TEXT NOT NULL REFERENCES screenshot_sets(id),
    source_id TEXT NOT NULL REFERENCES attachments(id),
    position INTEGER NOT NULL,
    submission_id TEXT NOT NULL,
    ocr_result_id TEXT,
    object_key TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    layout_version TEXT NOT NULL,
    accuracy TEXT CHECK (accuracy IN ('accurate', 'inaccurate')),
    PRIMARY KEY (set_id, source_id)
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
`);

const ocrResponse = (layoutVersion: string | null) => ({
  schema_version: "1", ok: true, model_version: "ocr-v1",
  ...(layoutVersion === null ? {} : { layout_version: layoutVersion }),
  fields: { map_name: { confidence: 0.97, status: "ok" } },
  data: { map_name: "萨摩亚" },
});

const sha = (seed: string) => seed.padEnd(64, "0").slice(0, 64);

const seedSubmission = (sqlite: DatabaseSync, input: { id: string; status: string; attachmentId?: string; attachmentStatus?: string; ocrResultId?: string; layoutVersion?: string | null; mark?: "accurate" | "inaccurate" }) => {
  sqlite.prepare("INSERT INTO submissions (id, player_account_id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, 'player-1', 'binding-1', ?, 'map_title_achievement', 'challenge-1', ?, '困难', 'Owner', 'qq', 'conv-1', ?, 1, 1)")
    .run(input.id, input.status, `地图-${input.id}`, `msg-${input.id}`);
  if (input.attachmentId) {
    sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'qq', ?, 'image/png', ?, ?, ?, ?, 1)")
      .run(input.attachmentId, input.id, `ext-${input.attachmentId}`, 1234, sha(`sha-${input.attachmentId}`), `uploads/submissions/${input.id}/${sha(`sha-${input.attachmentId}`)}.png`, input.attachmentStatus ?? "stored");
  }
  if (input.ocrResultId) {
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at) VALUES (?, ?, ?, 1, 'ok', ?, 1)")
      .run(input.ocrResultId, input.id, `req-${input.ocrResultId}`, JSON.stringify(ocrResponse(input.layoutVersion === undefined ? "layout-v2" : input.layoutVersion)));
  }
  if (input.mark && input.ocrResultId) {
    sqlite.prepare("INSERT INTO ocr_accuracy_feedback (id, submission_id, ocr_result_id, accuracy, marked_by, marked_by_type, created_at, updated_at) VALUES (?, ?, ?, ?, 'maintainer-1', 'maintainer', 1, 1)")
      .run(`mark-${input.ocrResultId}`, input.id, input.ocrResultId, input.mark);
  }
};

const maintainer = { actorType: "user" as const, subject: "maintainer-1", roles: ["maintainer"], provider: "test" };

const setup = () => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, "https://evidence.owbastion.codes");
  return { sqlite, services };
};

describe("screenshot sets", () => {
  it("selects members by rule: approved submissions plus inaccurate-marked screenshots, deduplicated", async () => {
    const { sqlite, services } = setup();
    // Approved -> member (unmarked).
    seedSubmission(sqlite, { id: "sub-approved", status: "approved", attachmentId: "att-approved", ocrResultId: "ocr-approved" });
    // Rejected without a mark -> not a member.
    seedSubmission(sqlite, { id: "sub-rejected", status: "rejected", attachmentId: "att-rejected", ocrResultId: "ocr-rejected" });
    // Rejected but the current recognition is marked inaccurate -> member.
    seedSubmission(sqlite, { id: "sub-marked", status: "rejected", attachmentId: "att-marked", ocrResultId: "ocr-marked", mark: "inaccurate" });
    // Approved AND marked inaccurate -> a single member carrying the mark.
    seedSubmission(sqlite, { id: "sub-both", status: "approved", attachmentId: "att-both", ocrResultId: "ocr-both", mark: "inaccurate" });

    const candidates = await services.listAdminScreenshotSetCandidates({ page: 1, pageSize: 100 }, maintainer);
    expect(candidates.items.map((item) => item.sourceId).sort()).toEqual(["att-approved", "att-both", "att-marked"]);
    const bySubmission = new Map(candidates.items.map((item) => [item.submissionId, item]));
    expect(bySubmission.get("sub-approved")).toMatchObject({ sourceId: "att-approved", accuracy: null, submissionStatus: "approved" });
    expect(bySubmission.get("sub-marked")).toMatchObject({ sourceId: "att-marked", accuracy: "inaccurate" });
    expect(bySubmission.get("sub-both")).toMatchObject({ sourceId: "att-both", accuracy: "inaccurate" });
    expect(bySubmission.has("sub-rejected")).toBe(false);

    const created = await services.createAdminScreenshotSet({}, maintainer, "key-1");
    const detail = await services.getAdminScreenshotSet({ setId: created.setId }, maintainer);
    expect(detail.members.map((member) => member.submissionId).sort()).toEqual(["sub-approved", "sub-both", "sub-marked"]);
    // A source screenshot appears exactly once even when both rules match.
    expect(detail.members.filter((member) => member.submissionId === "sub-both")).toHaveLength(1);
  });

  it("ignores stale inaccurate marks bound to an older recognition", async () => {
    const { sqlite, services } = setup();
    seedSubmission(sqlite, { id: "sub-stale", status: "rejected", attachmentId: "att-stale", ocrResultId: "ocr-old", mark: "inaccurate" });
    // A newer unmarked recognition supersedes the marked one.
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, created_at) VALUES ('ocr-new', 'sub-stale', 'req-new', 2, 'ok', ?, 2)")
      .run(JSON.stringify(ocrResponse("layout-v3")));

    const candidates = await services.listAdminScreenshotSetCandidates({ page: 1, pageSize: 100 }, maintainer);
    expect(candidates.items.map((item) => item.submissionId)).not.toContain("sub-stale");
  });

  it("auto-excludes screenshots without a usable layout version or stored evidence", async () => {
    const { sqlite, services } = setup();
    seedSubmission(sqlite, { id: "sub-ok", status: "approved", attachmentId: "att-ok", ocrResultId: "ocr-ok" });
    seedSubmission(sqlite, { id: "sub-nolayout", status: "approved", attachmentId: "att-nolayout", ocrResultId: "ocr-nolayout", layoutVersion: null });
    seedSubmission(sqlite, { id: "sub-noevidence", status: "approved", ocrResultId: "ocr-noevidence" });
    seedSubmission(sqlite, { id: "sub-unstored", status: "approved", attachmentId: "att-unstored", attachmentStatus: "pending", ocrResultId: "ocr-unstored" });

    const created = await services.createAdminScreenshotSet({}, maintainer, "key-1");
    const detail = await services.getAdminScreenshotSet({ setId: created.setId }, maintainer);
    expect(detail.members.map((member) => member.submissionId)).toEqual(["sub-ok"]);
    const bySubmission = new Map(detail.exclusions.map((exclusion) => [exclusion.submissionId, exclusion]));
    expect(bySubmission.get("sub-nolayout")).toMatchObject({ sourceId: "att-nolayout", reason: "missing_layout_version" });
    expect(bySubmission.get("sub-noevidence")).toMatchObject({ sourceId: null, reason: "missing_evidence" });
    expect(bySubmission.get("sub-unstored")).toMatchObject({ sourceId: null, reason: "missing_evidence" });
  });

  it("lets a maintainer exclude anomalous screenshots before finalization and validates the list", async () => {
    const { sqlite, services } = setup();
    seedSubmission(sqlite, { id: "sub-a", status: "approved", attachmentId: "att-a", ocrResultId: "ocr-a" });
    seedSubmission(sqlite, { id: "sub-b", status: "approved", attachmentId: "att-b", ocrResultId: "ocr-b" });

    await expect(services.createAdminScreenshotSet({ excludedSourceIds: ["00000000-0000-4000-8000-0000000000aa"] }, maintainer, "key-bad")).rejects.toThrow("SCREENSHOT_SET_EXCLUSION_INVALID");

    const created = await services.createAdminScreenshotSet({ excludedSourceIds: ["att-b"] }, maintainer, "key-2");
    expect(created.counts).toEqual({ memberCount: 1, excludedCount: 1 });
    const detail = await services.getAdminScreenshotSet({ setId: created.setId }, maintainer);
    expect(detail.members.map((member) => member.sourceId)).toEqual(["att-a"]);
    expect(detail.exclusions).toEqual([{ sourceId: "att-b", submissionId: "sub-b", reason: "maintainer_excluded" }]);
  });

  it("freezes membership and provenance at creation; finalization is immutable", async () => {
    const { sqlite, services } = setup();
    seedSubmission(sqlite, { id: "sub-a", status: "approved", attachmentId: "att-a", ocrResultId: "ocr-a", mark: "accurate" });

    const draft = await services.createAdminScreenshotSet({ note: "first" }, maintainer, "key-1");
    expect(draft).toMatchObject({ version: 1, status: "draft", counts: { memberCount: 1, excludedCount: 0 } });

    // Replay of the same idempotency key returns the original result.
    const replay = await services.createAdminScreenshotSet({ note: "first" }, maintainer, "key-1");
    expect(replay).toEqual(draft);
    await expect(services.createAdminScreenshotSet({ note: "different" }, maintainer, "key-1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");

    // Later business changes do not rewrite the frozen member payload.
    sqlite.prepare("UPDATE submissions SET status = 'rejected' WHERE id = 'sub-a'").run();
    sqlite.prepare("UPDATE ocr_accuracy_feedback SET accuracy = 'inaccurate' WHERE submission_id = 'sub-a'").run();
    const detail = await services.getAdminScreenshotSet({ setId: draft.setId }, maintainer);
    expect(detail.members).toEqual([{
      sourceId: "att-a", submissionId: "sub-a", mapName: "地图-sub-a",
      objectKey: `uploads/submissions/sub-a/${sha("sha-att-a")}.png`, sha256: sha("sha-att-a"),
      mimeType: "image/png", sizeBytes: 1234, layoutVersion: "layout-v2", accuracy: "accurate",
      evidenceUrl: `https://evidence.owbastion.codes/uploads/submissions/sub-a/${sha("sha-att-a")}.png`,
    }]);

    const finalized = await services.finalizeAdminScreenshotSet({ setId: draft.setId }, maintainer, "key-f1");
    expect(finalized).toMatchObject({ status: "finalized", version: 1 });
    await expect(services.finalizeAdminScreenshotSet({ setId: draft.setId }, maintainer, "key-f2")).rejects.toThrow("SCREENSHOT_SET_ALREADY_FINALIZED");
    const finalizedReplay = await services.finalizeAdminScreenshotSet({ setId: draft.setId }, maintainer, "key-f1");
    expect(finalizedReplay).toEqual(finalized);

    // The next set takes the next version number.
    const second = await services.createAdminScreenshotSet({}, maintainer, "key-2");
    expect(second.version).toBe(2);
  });

  it("serves only finalized sets to OCRKit, with the privacy-scoped member payload", async () => {
    const { sqlite, services } = setup();
    seedSubmission(sqlite, { id: "sub-a", status: "approved", attachmentId: "att-a", ocrResultId: "ocr-a", mark: "inaccurate" });
    seedSubmission(sqlite, { id: "sub-b", status: "approved", attachmentId: "att-b", ocrResultId: "ocr-b" });

    const draft = await services.createAdminScreenshotSet({}, maintainer, "key-1");
    await expect(services.getOcrkitScreenshotSet({ version: 99 })).rejects.toThrow("SCREENSHOT_SET_NOT_FOUND");
    await expect(services.getOcrkitScreenshotSet({ version: draft.version })).rejects.toThrow("SCREENSHOT_SET_NOT_FINALIZED");

    await services.finalizeAdminScreenshotSet({ setId: draft.setId }, maintainer, "key-f1");
    const payload = await services.getOcrkitScreenshotSet({ version: draft.version });
    expect(payload.schema_version).toBe(1);
    expect(payload.set_id).toBe(draft.setId);
    expect(payload.version).toBe(1);
    expect(payload.finalized).toBe(true);
    expect(payload.finalized_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(payload.members).toHaveLength(2);
    expect(payload.members[0]).toEqual({
      source_id: "att-a",
      object_key: `uploads/submissions/sub-a/${sha("sha-att-a")}.png`,
      sha256: sha("sha-att-a"),
      mime_type: "image/png",
      size_bytes: 1234,
      layout_version: "layout-v2",
      accuracy: "inaccurate",
    });
    expect(payload.members[1]!.accuracy).toBeNull();

    // Nothing from the forbidden list: no player identity, QQ data, Submission
    // decision, Grant/mastery state, or risk signals anywhere in the payload.
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["player", "qq", "player_account", "binding", "status", "decision", "grant", "mastery", "risk", "submission_id", "confidence", "response_json"])
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    for (const member of payload.members)
      expect(Object.keys(member).sort()).toEqual(["accuracy", "layout_version", "mime_type", "object_key", "sha256", "size_bytes", "source_id"]);

    const sets = await services.listAdminScreenshotSets({ page: 1, pageSize: 20 }, maintainer);
    expect(sets.items).toHaveLength(1);
    expect(sets.items[0]).toMatchObject({ version: 1, status: "finalized", counts: { memberCount: 2, excludedCount: 0 } });
    await expect(services.getAdminScreenshotSet({ setId: "00000000-0000-4000-8000-0000000000aa" }, maintainer)).rejects.toThrow("SCREENSHOT_SET_NOT_FOUND");
  });
});
