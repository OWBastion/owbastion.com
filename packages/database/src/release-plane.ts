import type { AuthContext } from "@owbastion/domain";
import type {
  ReleaseBuildResultRequest,
  ReleaseContentItem,
  ReleaseDraftCreateRequest,
  ReleaseDraftDetailResponse,
  ReleaseDiffChange,
  ReleaseDraftItemRequest,
  ReleaseSnapshot,
} from "@owbastion/contracts";

type ReleaseDispatch = (payload: { buildId: string; candidateId: string; releaseId: string; snapshotHash: string; codeRef: string }) => Promise<void>;
type ReleaseCatalogProvider = () => Promise<ReleaseContentItem[]>;
type Db = D1Database;
type DraftResponse = { contractVersion: "1"; draftId: string; name: string; status: "open"; createdAt: number; updatedAt: number };
type DraftItemResponse = { contractVersion: "1"; itemId: string; draftId: string; contentType: string; contentId: string; operation: string };
type ChangeSetResponse = { contractVersion: "1"; changeSetId: string; draftId: string; name: string; itemCount: number; status: "open" };
type CandidateResponse = { contractVersion: "1"; candidateId: string; changeSetId: string; sourceVersion: string; snapshotHash: string; status: "candidate"; createdAt: number };
type BuildResponse = { contractVersion: "1"; buildId: string; candidateId: string; releaseId: string; status: "queued" };

const contractVersion = "1" as const;
const now = () => Date.now();
const json = (value: unknown) => JSON.stringify(value);
const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
};

const hashText = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hashInput = async (value: unknown) => hashText(JSON.stringify(stableValue(value)));

const replayOrConflict = async <T>(db: Db, actorId: string, operation: string, key: string, input: unknown) => {
  const existing = await db.prepare("SELECT request_hash, response_json FROM idempotency_keys WHERE id = ?1").bind(`${actorId}:${operation}:${key}`).first<{ request_hash: string; response_json: string }>();
  if (!existing) return null;
  const requestHash = await hashInput(input);
  if (existing.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
  return parseJson<T>(existing.response_json);
};

const idempotencyStatement = async (db: Db, actorId: string, operation: string, key: string, input: unknown, response: unknown) =>
  db.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(`${actorId}:${operation}:${key}`, actorId, operation, await hashInput(input), json(response), now());

const auditStatement = (db: Db, auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) =>
  db.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, entityType, entityId, json(payload), now());

const asItem = (row: { content_type: string; content_id: string; operation: string; data_json: string }): ReleaseContentItem => ({
  contentType: row.content_type as ReleaseContentItem["contentType"],
  contentId: row.content_id,
  operation: row.operation as ReleaseContentItem["operation"],
  data: parseJson<Record<string, unknown>>(row.data_json),
});

const snapshotForHash = (snapshot: Omit<ReleaseSnapshot, "snapshotHash">) => ({ ...snapshot, snapshotHash: undefined });
const itemKey = (item: Pick<ReleaseContentItem, "contentType" | "contentId">) => `${item.contentType}:${item.contentId}`;
const releaseDiff = (beforeItems: ReleaseContentItem[], afterItems: ReleaseContentItem[]): ReleaseDiffChange[] => {
  const before = new Map(beforeItems.map((item) => [itemKey(item), item]));
  const after = new Map(afterItems.map((item) => [itemKey(item), item]));
  const changes: ReleaseDiffChange[] = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const previous = before.get(key);
    const next = after.get(key);
    if (!previous && next) changes.push({ contentType: next.contentType, contentId: next.contentId, change: "added", beforeOperation: null, afterOperation: next.operation, before: null, after: next.data });
    else if (previous && !next) changes.push({ contentType: previous.contentType, contentId: previous.contentId, change: "removed", beforeOperation: previous.operation, afterOperation: null, before: previous.data, after: null });
    else if (previous && next && JSON.stringify(stableValue([previous.operation, previous.data])) !== JSON.stringify(stableValue([next.operation, next.data]))) changes.push({ contentType: next.contentType, contentId: next.contentId, change: "modified", beforeOperation: previous.operation, afterOperation: next.operation, before: previous.data, after: next.data });
  }
  return changes;
};

export const createReleasePlaneServices = (database: Db, dispatchBuild?: ReleaseDispatch, catalogProvider?: ReleaseCatalogProvider) => {
  const createDraft = async (input: ReleaseDraftCreateRequest, auth: AuthContext, idempotencyKey: string): Promise<DraftResponse> => {
    const replay = await replayOrConflict<DraftResponse>(database, auth.subject, "release.draft.create", idempotencyKey, input);
    if (replay) return replay;
    const draftId = crypto.randomUUID();
    const timestamp = now();
    const response = { contractVersion, draftId, name: input.name, status: "open" as const, createdAt: timestamp, updatedAt: timestamp };
    await database.batch([
      database.prepare("INSERT INTO content_drafts (id, name, status, created_by, created_at, updated_at) VALUES (?1, ?2, 'open', ?3, ?4, ?4)").bind(draftId, input.name, auth.subject, timestamp),
      await idempotencyStatement(database, auth.subject, "release.draft.create", idempotencyKey, input, response),
      auditStatement(database, auth, "release.draft.create", "content_draft", draftId, { name: input.name }),
    ]);
    return response;
  };

  const createDraftFromCatalog = async (input: ReleaseDraftCreateRequest, auth: AuthContext, idempotencyKey: string): Promise<DraftResponse> => {
    const replay = await replayOrConflict<DraftResponse>(database, auth.subject, "release.draft.create-from-catalog", idempotencyKey, input);
    if (replay) return replay;
    if (!catalogProvider) throw new Error("RELEASE_CATALOG_PROVIDER_UNAVAILABLE");
    const items = await catalogProvider();
    const draftId = crypto.randomUUID();
    const timestamp = now();
    const response = { contractVersion, draftId, name: input.name, status: "open" as const, createdAt: timestamp, updatedAt: timestamp };
    const statements: D1PreparedStatement[] = [database.prepare("INSERT INTO content_drafts (id, name, status, created_by, created_at, updated_at) VALUES (?1, ?2, 'open', ?3, ?4, ?4)").bind(draftId, input.name, auth.subject, timestamp)];
    if (items.length) {
      const values = items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(",");
      const bindings = items.flatMap((item) => [crypto.randomUUID(), draftId, item.contentType, item.contentId, item.operation, json(item.data), timestamp, timestamp]);
      statements.push(database.prepare(`INSERT INTO content_draft_items (id, draft_id, content_type, content_id, operation, data_json, created_at, updated_at) VALUES ${values}`).bind(...bindings));
    }
    statements.push(await idempotencyStatement(database, auth.subject, "release.draft.create-from-catalog", idempotencyKey, input, response));
    statements.push(auditStatement(database, auth, "release.draft.create-from-catalog", "content_draft", draftId, { name: input.name, itemCount: items.length }));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    return response;
  };

  const putDraftItem = async (input: ReleaseDraftItemRequest & { draftId: string }, auth: AuthContext, idempotencyKey: string): Promise<DraftItemResponse> => {
    const replay = await replayOrConflict<DraftItemResponse>(database, auth.subject, "release.draft.item.put", idempotencyKey, input);
    if (replay) return replay;
    const draft = await database.prepare("SELECT id FROM content_drafts WHERE id = ?1 AND status = 'open'").bind(input.draftId).first<{ id: string }>();
    if (!draft) throw new Error("DRAFT_NOT_FOUND");
    const itemId = crypto.randomUUID();
    const timestamp = now();
    const existing = await database.prepare("SELECT id FROM content_draft_items WHERE draft_id = ?1 AND content_type = ?2 AND content_id = ?3").bind(input.draftId, input.contentType, input.contentId).first<{ id: string }>();
    const response: DraftItemResponse = { contractVersion, itemId: existing?.id ?? itemId, draftId: input.draftId, contentType: input.contentType, contentId: input.contentId, operation: input.operation };
    const write = existing
      ? database.prepare("UPDATE content_draft_items SET operation = ?1, data_json = ?2, updated_at = ?3 WHERE id = ?4").bind(input.operation, json(input.data), timestamp, existing.id)
      : database.prepare("INSERT INTO content_draft_items (id, draft_id, content_type, content_id, operation, data_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)").bind(itemId, input.draftId, input.contentType, input.contentId, input.operation, json(input.data), timestamp);
    await database.batch([
      write,
      database.prepare("UPDATE content_drafts SET updated_at = ?1 WHERE id = ?2").bind(timestamp, input.draftId),
      await idempotencyStatement(database, auth.subject, "release.draft.item.put", idempotencyKey, input, response),
      auditStatement(database, auth, "release.draft.item.put", "content_draft_item", response.itemId, { draftId: input.draftId, contentType: input.contentType, contentId: input.contentId, operation: input.operation }),
    ]);
    return response;
  };

  const createChangeSet = async (input: { draftId: string; name: string; itemIds: string[] }, auth: AuthContext, idempotencyKey: string): Promise<ChangeSetResponse> => {
    const replay = await replayOrConflict<ChangeSetResponse>(database, auth.subject, "release.change-set.create", idempotencyKey, input);
    if (replay) return replay;
    const draft = await database.prepare("SELECT id FROM content_drafts WHERE id = ?1 AND status = 'open'").bind(input.draftId).first<{ id: string }>();
    if (!draft) throw new Error("DRAFT_NOT_FOUND");
    const placeholders = input.itemIds.map(() => "?").join(",");
    const items = await database.prepare(`SELECT id, content_type, content_id, operation, data_json FROM content_draft_items WHERE draft_id = ?1 AND id IN (${placeholders})`).bind(input.draftId, ...input.itemIds).all<{ id: string; content_type: string; content_id: string; operation: string; data_json: string }>();
    if (items.results.length !== new Set(input.itemIds).size) throw new Error("DRAFT_ITEMS_NOT_FOUND");
    const changeSetId = crypto.randomUUID();
    const timestamp = now();
    const statements: D1PreparedStatement[] = [database.prepare("INSERT INTO content_change_sets (id, draft_id, name, status, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, 'open', ?4, ?5, ?5)").bind(changeSetId, input.draftId, input.name, auth.subject, timestamp)];
    for (const item of items.results) statements.push(database.prepare("INSERT INTO content_change_set_items (id, change_set_id, content_type, content_id, operation, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(crypto.randomUUID(), changeSetId, item.content_type, item.content_id, item.operation, item.data_json, timestamp));
    const response: ChangeSetResponse = { contractVersion, changeSetId, draftId: input.draftId, name: input.name, itemCount: items.results.length, status: "open" };
    statements.push(await idempotencyStatement(database, auth.subject, "release.change-set.create", idempotencyKey, input, response));
    statements.push(auditStatement(database, auth, "release.change-set.create", "content_change_set", changeSetId, { draftId: input.draftId, itemCount: items.results.length }));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    return response;
  };

  const currentItems = async (): Promise<ReleaseContentItem[]> => {
    const state = await database.prepare("SELECT current_release_id FROM content_release_state WHERE id = 'singleton'").first<{ current_release_id: string | null }>();
    if (!state?.current_release_id) return [];
    const release = await database.prepare("SELECT candidate_id FROM content_releases WHERE id = ?1 AND status = 'active'").bind(state.current_release_id).first<{ candidate_id: string }>();
    if (!release) return [];
    const candidate = await database.prepare("SELECT snapshot_json FROM content_candidates WHERE id = ?1").bind(release.candidate_id).first<{ snapshot_json: string }>();
    return candidate ? parseJson<ReleaseSnapshot>(candidate.snapshot_json).items : [];
  };

  const getDraft = async (draftId: string): Promise<ReleaseDraftDetailResponse> => {
    const draft = await database.prepare("SELECT id, name, status, created_at, updated_at FROM content_drafts WHERE id = ?1").bind(draftId).first<{ id: string; name: string; status: string; created_at: number; updated_at: number }>();
    if (!draft || draft.status !== "open") throw new Error("DRAFT_NOT_FOUND");
    const items = await database.prepare("SELECT content_type, content_id, operation, data_json FROM content_draft_items WHERE draft_id = ?1 ORDER BY content_type, content_id").bind(draftId).all<{ content_type: string; content_id: string; operation: string; data_json: string }>();
    const releaseItems = items.results.map(asItem);
    return { contractVersion, draftId: draft.id, name: draft.name, status: "open", createdAt: draft.created_at, updatedAt: draft.updated_at, items: releaseItems, diff: releaseDiff(await currentItems(), releaseItems) };
  };

  const createChangeSetFromDraft = async (input: { draftId: string; name: string }, auth: AuthContext, idempotencyKey: string): Promise<ChangeSetResponse> => {
    const replay = await replayOrConflict<ChangeSetResponse>(database, auth.subject, "release.change-set.create-from-draft", idempotencyKey, input);
    if (replay) return replay;
    const draft = await getDraft(input.draftId);
    if (!draft.diff.length) throw new Error("DRAFT_NO_CHANGES");
    const draftByKey = new Map(draft.items.map((item) => [itemKey(item), item]));
    const currentByKey = new Map((await currentItems()).map((item) => [itemKey(item), item]));
    const changes: ReleaseContentItem[] = draft.diff.map((change) => draftByKey.get(`${change.contentType}:${change.contentId}`) ?? ({ contentType: change.contentType, contentId: change.contentId, operation: "delete", data: {} }));
    const changeSetId = crypto.randomUUID();
    const timestamp = now();
    const statements: D1PreparedStatement[] = [database.prepare("INSERT INTO content_change_sets (id, draft_id, name, status, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, 'open', ?4, ?5, ?5)").bind(changeSetId, input.draftId, input.name, auth.subject, timestamp)];
    for (const item of changes) statements.push(database.prepare("INSERT INTO content_change_set_items (id, change_set_id, content_type, content_id, operation, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(crypto.randomUUID(), changeSetId, item.contentType, item.contentId, item.operation, json(item.data), timestamp));
    const response: ChangeSetResponse = { contractVersion, changeSetId, draftId: input.draftId, name: input.name, itemCount: changes.length, status: "open" };
    statements.push(await idempotencyStatement(database, auth.subject, "release.change-set.create-from-draft", idempotencyKey, input, response));
    statements.push(auditStatement(database, auth, "release.change-set.create-from-draft", "content_change_set", changeSetId, { draftId: input.draftId, itemCount: changes.length, removedCount: [...currentByKey.keys()].filter((key) => !draftByKey.has(key)).length }));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    return response;
  };

  const createCandidate = async (input: { changeSetId: string }, auth: AuthContext, idempotencyKey: string): Promise<CandidateResponse> => {
    const replay = await replayOrConflict<CandidateResponse>(database, auth.subject, "release.candidate.create", idempotencyKey, input);
    if (replay) return replay;
    const changeSet = await database.prepare("SELECT id, name, status FROM content_change_sets WHERE id = ?1").bind(input.changeSetId).first<{ id: string; name: string; status: string }>();
    if (!changeSet || changeSet.status !== "open") throw new Error("CHANGE_SET_NOT_FOUND");
    const state = await database.prepare("SELECT current_release_id FROM content_release_state WHERE id = 'singleton'").first<{ current_release_id: string | null }>();
    let baseItems: ReleaseContentItem[] = [];
    if (state?.current_release_id) {
      const release = await database.prepare("SELECT candidate_id FROM content_releases WHERE id = ?1").bind(state.current_release_id).first<{ candidate_id: string }>();
      if (release) {
        const candidate = await database.prepare("SELECT snapshot_json FROM content_candidates WHERE id = ?1").bind(release.candidate_id).first<{ snapshot_json: string }>();
        if (candidate) baseItems = parseJson<ReleaseSnapshot>(candidate.snapshot_json).items;
      }
    }
    const changes = await database.prepare("SELECT content_type, content_id, operation, data_json FROM content_change_set_items WHERE change_set_id = ?1 ORDER BY content_id").bind(input.changeSetId).all<{ content_type: string; content_id: string; operation: string; data_json: string }>();
    if (!changes.results.length) throw new Error("CHANGE_SET_EMPTY");
    const merged = new Map(baseItems.map((item) => [`${item.contentType}:${item.contentId}`, item]));
    for (const item of changes.results) {
      const next = asItem(item);
      const key = `${next.contentType}:${next.contentId}`;
      if (next.operation === "delete") merged.delete(key);
      else merged.set(key, next);
    }
    const candidateId = crypto.randomUUID();
    const timestamp = now();
    const withoutHash: Omit<ReleaseSnapshot, "snapshotHash"> = { schemaVersion: 1, candidateId, baseReleaseId: state?.current_release_id ?? null, sourceVersion: `candidate-${candidateId.slice(0, 8)}`, generatedAt: timestamp, items: [...merged.values()].sort((left, right) => `${left.contentType}:${left.contentId}`.localeCompare(`${right.contentType}:${right.contentId}`)) };
    const snapshot: ReleaseSnapshot = { ...withoutHash, snapshotHash: await hashInput(snapshotForHash(withoutHash)) };
    const response: CandidateResponse = { contractVersion, candidateId, changeSetId: input.changeSetId, sourceVersion: snapshot.sourceVersion, snapshotHash: snapshot.snapshotHash, status: "candidate", createdAt: timestamp };
    await database.batch([
      database.prepare("INSERT INTO content_candidates (id, change_set_id, base_release_id, source_version, snapshot_json, snapshot_hash, status, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'candidate', ?7, ?8)").bind(candidateId, input.changeSetId, withoutHash.baseReleaseId, snapshot.sourceVersion, json(snapshot), snapshot.snapshotHash, auth.subject, timestamp),
      database.prepare("UPDATE content_change_sets SET status = 'candidate', updated_at = ?1 WHERE id = ?2").bind(timestamp, input.changeSetId),
      database.prepare("INSERT INTO content_release_state (id, current_release_id, next_candidate_id, updated_at) VALUES ('singleton', ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET next_candidate_id = excluded.next_candidate_id, updated_at = excluded.updated_at").bind(state?.current_release_id ?? null, candidateId, timestamp),
      await idempotencyStatement(database, auth.subject, "release.candidate.create", idempotencyKey, input, response),
      auditStatement(database, auth, "release.candidate.create", "content_candidate", candidateId, { changeSetId: input.changeSetId, snapshotHash: snapshot.snapshotHash, itemCount: snapshot.items.length }),
    ]);
    return response;
  };

  const getCandidate = async (candidateId: string) => {
    const row = await database.prepare("SELECT id, change_set_id, source_version, snapshot_json, snapshot_hash, status, created_at FROM content_candidates WHERE id = ?1").bind(candidateId).first<{ id: string; change_set_id: string; source_version: string; snapshot_json: string; snapshot_hash: string; status: string; created_at: number }>();
    if (!row) throw new Error("CANDIDATE_NOT_FOUND");
    return { contractVersion, candidateId: row.id, changeSetId: row.change_set_id, sourceVersion: row.source_version, snapshotHash: row.snapshot_hash, status: row.status, createdAt: row.created_at, snapshot: parseJson<ReleaseSnapshot>(row.snapshot_json) };
  };

  const startBuild = async (input: { candidateId: string }, auth: AuthContext, idempotencyKey: string): Promise<BuildResponse> => {
    const replay = await replayOrConflict<BuildResponse>(database, auth.subject, "release.build.start", idempotencyKey, input);
    if (replay) return replay;
    const running = await database.prepare("SELECT id FROM content_build_tasks WHERE status IN ('queued', 'running') LIMIT 1").first<{ id: string }>();
    if (running) throw new Error("BUILD_ALREADY_RUNNING");
    const candidate = await database.prepare("SELECT id, source_version, snapshot_hash, status FROM content_candidates WHERE id = ?1").bind(input.candidateId).first<{ id: string; source_version: string; snapshot_hash: string; status: string }>();
    if (!candidate || !["candidate", "failed"].includes(candidate.status)) throw new Error("CANDIDATE_NOT_BUILDABLE");
    const releaseId = crypto.randomUUID();
    const buildId = crypto.randomUUID();
    const timestamp = now();
    const response: BuildResponse = { contractVersion, buildId, candidateId: input.candidateId, releaseId, status: "queued" };
    await database.batch([
      database.prepare("INSERT INTO content_releases (id, candidate_id, source_version, status, created_at) VALUES (?1, ?2, ?3, 'pending', ?4)").bind(releaseId, input.candidateId, candidate.source_version, timestamp),
      database.prepare("INSERT INTO content_build_tasks (id, release_id, candidate_id, status, snapshot_hash, request_hash, created_at, updated_at) VALUES (?1, ?2, ?3, 'queued', ?4, ?5, ?6, ?6)").bind(buildId, releaseId, input.candidateId, candidate.snapshot_hash, await hashInput(input), timestamp),
      database.prepare("UPDATE content_candidates SET status = 'queued' WHERE id = ?1").bind(input.candidateId),
      database.prepare("UPDATE content_release_state SET next_candidate_id = ?1, updated_at = ?2 WHERE id = 'singleton'").bind(input.candidateId, timestamp),
      await idempotencyStatement(database, auth.subject, "release.build.start", idempotencyKey, input, response),
      auditStatement(database, auth, "release.build.start", "content_build_task", buildId, { candidateId: input.candidateId, releaseId }),
    ]);
    if (dispatchBuild) {
      try {
        await dispatchBuild({ buildId, candidateId: input.candidateId, releaseId, snapshotHash: candidate.snapshot_hash, codeRef: "main" });
      } catch {
        await database.batch([
          database.prepare("UPDATE content_build_tasks SET status = 'failed', diagnostics_json = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'queued'").bind(json({ errors: ["Bastion build dispatch failed"] }), now(), buildId),
          database.prepare("UPDATE content_candidates SET status = 'failed' WHERE id = ?1").bind(input.candidateId),
        ]);
        throw new Error("BUILD_DISPATCH_FAILED");
      }
    }
    return response;
  };

  const receiveBuildResult = async (input: ReleaseBuildResultRequest) => {
    const resultHash = await hashInput(input);
    const task = await database.prepare("SELECT id, release_id, candidate_id, status, snapshot_hash, result_hash FROM content_build_tasks WHERE id = ?1").bind(input.buildId).first<{ id: string; release_id: string; candidate_id: string; status: string; snapshot_hash: string; result_hash: string | null }>();
    if (!task || task.candidate_id !== input.candidateId) throw new Error("BUILD_NOT_FOUND");
    if (task.snapshot_hash !== input.snapshotHash) throw new Error("BUILD_SNAPSHOT_MISMATCH");
    if (["succeeded", "failed"].includes(task.status)) {
      if (task.result_hash === resultHash) return { contractVersion, buildId: input.buildId, candidateId: input.candidateId, releaseId: task.release_id, status: input.status };
      throw new Error("BUILD_RESULT_CONFLICT");
    }
    if (["succeeded", "failed"].includes(task.status)) throw new Error("BUILD_RESULT_CONFLICT");
    const timestamp = now();
    const diagnostics = { warnings: input.warnings, errors: input.errors };
    const artifactRefs = json(input.artifactRefs);
    const statements: D1PreparedStatement[] = [
      database.prepare("UPDATE content_build_tasks SET status = ?1, bastion_commit_sha = ?2, artifact_refs_json = ?3, diagnostics_json = ?4, result_hash = ?5, updated_at = ?6 WHERE id = ?7").bind(input.status, input.bastionCommitSha, artifactRefs, json(diagnostics), resultHash, timestamp, input.buildId),
      database.prepare("UPDATE content_candidates SET status = ?1 WHERE id = ?2").bind(input.status, input.candidateId),
      database.prepare("UPDATE content_releases SET status = ?1, bastion_commit_sha = ?2, artifact_refs_json = ?3, diagnostics_json = ?4, activated_at = ?5 WHERE id = ?6").bind(input.status === "succeeded" ? "active" : "pending", input.bastionCommitSha, artifactRefs, json(diagnostics), input.status === "succeeded" ? timestamp : null, task.release_id),
    ];
    if (input.status === "succeeded") {
      statements.push(database.prepare("UPDATE content_releases SET status = 'superseded' WHERE status = 'active' AND id <> ?1").bind(task.release_id));
      statements.push(database.prepare("INSERT INTO content_release_state (id, current_release_id, next_candidate_id, updated_at) VALUES ('singleton', ?1, NULL, ?2) ON CONFLICT(id) DO UPDATE SET current_release_id = excluded.current_release_id, next_candidate_id = NULL, updated_at = excluded.updated_at").bind(task.release_id, timestamp));
    }
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    return { contractVersion, buildId: input.buildId, candidateId: input.candidateId, releaseId: task.release_id, status: input.status };
  };

  const overview = async () => {
    const state = await database.prepare("SELECT current_release_id, next_candidate_id FROM content_release_state WHERE id = 'singleton'").first<{ current_release_id: string | null; next_candidate_id: string | null }>();
    const current = state?.current_release_id ? await database.prepare("SELECT id, candidate_id, source_version, bastion_commit_sha, activated_at FROM content_releases WHERE id = ?1").bind(state.current_release_id).first<{ id: string; candidate_id: string; source_version: string; bastion_commit_sha: string | null; activated_at: number | null }>() : null;
    const next = state?.next_candidate_id ? await database.prepare("SELECT id, source_version, snapshot_hash, status FROM content_candidates WHERE id = ?1").bind(state.next_candidate_id).first<{ id: string; source_version: string; snapshot_hash: string; status: string }>() : null;
    const drafts = await database.prepare("SELECT id, name, status, updated_at FROM content_drafts ORDER BY updated_at DESC LIMIT 50").all<{ id: string; name: string; status: string; updated_at: number }>();
    const releases = await database.prepare("SELECT id, candidate_id, source_version, status, bastion_commit_sha, activated_at, created_at FROM content_releases ORDER BY created_at DESC LIMIT 50").all<{ id: string; candidate_id: string; source_version: string; status: string; bastion_commit_sha: string | null; activated_at: number | null; created_at: number }>();
    return {
      contractVersion,
      current: current ? { releaseId: current.id, candidateId: current.candidate_id, sourceVersion: current.source_version, bastionCommitSha: current.bastion_commit_sha, activatedAt: current.activated_at } : null,
      next: next ? { candidateId: next.id, sourceVersion: next.source_version, snapshotHash: next.snapshot_hash, status: next.status as "candidate" | "queued" | "running" | "succeeded" | "failed" } : null,
      drafts: drafts.results.map((item) => ({ draftId: item.id, name: item.name, status: item.status, updatedAt: item.updated_at })),
      releases: releases.results.map((item) => ({ releaseId: item.id, candidateId: item.candidate_id, sourceVersion: item.source_version, status: item.status, bastionCommitSha: item.bastion_commit_sha, activatedAt: item.activated_at, createdAt: item.created_at })),
    };
  };

  const getCurrentReleaseSnapshot = async () => {
    const state = await database.prepare("SELECT current_release_id FROM content_release_state WHERE id = 'singleton'").first<{ current_release_id: string | null }>();
    if (!state?.current_release_id) return null;
    const release = await database.prepare("SELECT candidate_id FROM content_releases WHERE id = ?1 AND status = 'active'").bind(state.current_release_id).first<{ candidate_id: string }>();
    if (!release) return null;
    const candidate = await database.prepare("SELECT snapshot_json FROM content_candidates WHERE id = ?1").bind(release.candidate_id).first<{ snapshot_json: string }>();
    return candidate ? parseJson<ReleaseSnapshot>(candidate.snapshot_json) : null;
  };

  return { createReleaseDraft: createDraft, createReleaseDraftFromCatalog: createDraftFromCatalog, getReleaseDraft: (input: { draftId: string }) => getDraft(input.draftId), putReleaseDraftItem: putDraftItem, createReleaseChangeSet: createChangeSet, createReleaseChangeSetFromDraft: createChangeSetFromDraft, createReleaseCandidate: createCandidate, getReleaseCandidate: (input: { candidateId: string }) => getCandidate(input.candidateId), startReleaseBuild: startBuild, receiveReleaseBuildResult: receiveBuildResult, getReleaseOverview: overview, getCurrentReleaseSnapshot };
};
