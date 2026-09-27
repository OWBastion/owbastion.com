import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { PlatformServices } from "@owbastion/domain";
import type {
  AdminDatasetCreateResponse,
  AdminDatasetDetailResponse,
  AdminDatasetFinalizeResponse,
  AdminDatasetListResponse,
  AdminReviewedAnnotation,
  OcrkitDatasetResponse,
} from "@owbastion/contracts";
import {
  attachments,
  datasetSnapshotAnnotations,
  datasetSnapshots,
  reviewedAnnotations,
  submissions,
} from "./schema";

type DatasetServices = Pick<PlatformServices,
  | "listAdminDatasetCandidates"
  | "createAdminDatasetDraft"
  | "listAdminDatasets"
  | "getAdminDataset"
  | "finalizeAdminDataset"
  | "getOcrkitDataset"
  | "getOcrkitDatasetEvidence"
>;

type DatasetServicesDependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  evidenceBucket?: R2Bucket;
  now: () => number;
  hashRequest: (input: unknown) => Promise<string>;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  pageResult: <T>(items: T[], page: number, pageSize: number, total: number) => {
    contractVersion: "1";
    items: T[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
};

export const createDatasetServices = ({
  database,
  db,
  evidenceBucket,
  now,
  hashRequest,
  replayOrConflict,
  pageResult,
}: DatasetServicesDependencies): DatasetServices => {
  const loadEligibility = async () => {
    const accepted = await db.select().from(reviewedAnnotations)
      .where(eq(reviewedAnnotations.reviewState, "accepted"))
      .orderBy(asc(reviewedAnnotations.reviewedAt), asc(reviewedAnnotations.id)).all();
    const memberRows = accepted.length
      ? await db.select({ annotationId: datasetSnapshotAnnotations.annotationId })
        .from(datasetSnapshotAnnotations)
        .where(inArray(datasetSnapshotAnnotations.annotationId, accepted.map((annotation) => annotation.id))).all()
      : [];
    const snapshottedIds = new Set(memberRows.map((row) => row.annotationId));
    const submissionIds = [...new Set(accepted.map((annotation) => annotation.submissionId))];
    const attachmentRows = submissionIds.length
      ? await db.select({
        submissionId: attachments.submissionId,
        objectKey: attachments.objectKey,
        contentType: attachments.contentType,
        createdAt: attachments.createdAt,
      }).from(attachments).where(inArray(attachments.submissionId, submissionIds)).all()
      : [];
    const latestAttachment = new Map<string, { objectKey: string; contentType: string }>();
    for (const row of [...attachmentRows].sort((left, right) => left.createdAt - right.createdAt)) {
      if (row.objectKey) latestAttachment.set(row.submissionId, { objectKey: row.objectKey, contentType: row.contentType });
    }
    const candidates: Array<{ annotation: typeof reviewedAnnotations.$inferSelect; objectKey: string; contentType: string }> = [];
    const exclusions: Array<{ annotationId: string; reason: string }> = [];
    for (const annotation of accepted) {
      if (snapshottedIds.has(annotation.id)) { exclusions.push({ annotationId: annotation.id, reason: "already_snapshotted" }); continue; }
      if (!annotation.modelVersion) { exclusions.push({ annotationId: annotation.id, reason: "missing_model_version" }); continue; }
      if (!annotation.layoutVersion) { exclusions.push({ annotationId: annotation.id, reason: "missing_layout_version" }); continue; }
      const evidence = latestAttachment.get(annotation.submissionId);
      if (!evidence) { exclusions.push({ annotationId: annotation.id, reason: "missing_evidence" }); continue; }
      candidates.push({ annotation, ...evidence });
    }
    return { accepted, candidates, exclusions };
  };

  const snapshotCounts = (snapshot: typeof datasetSnapshots.$inferSelect, eligibility: {
    eligibleCount: number;
    excludedCount: number;
    submissionCount: number;
    annotationCount: number;
  }) => ({
    datasetId: snapshot.id,
    version: snapshot.version,
    status: snapshot.status as "draft" | "finalized",
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt,
    finalizedBy: snapshot.finalizedBy,
    finalizedAt: snapshot.finalizedAt,
    note: snapshot.note,
    counts: {
      eligibleCount: eligibility.eligibleCount,
      excludedCount: eligibility.excludedCount,
      submissionCount: eligibility.submissionCount,
      annotationCount: eligibility.annotationCount,
    },
  });

  const loadSnapshotMembers = async (snapshotId: string) => {
    const members = await db.select().from(datasetSnapshotAnnotations)
      .where(eq(datasetSnapshotAnnotations.snapshotId, snapshotId))
      .orderBy(asc(datasetSnapshotAnnotations.position)).all();
    const annotationIds = members.map((member) => member.annotationId);
    const annotations = annotationIds.length
      ? await db.select().from(reviewedAnnotations).where(inArray(reviewedAnnotations.id, annotationIds)).all()
      : [];
    const byId = new Map(annotations.map((annotation) => [annotation.id, annotation]));
    return members.map((member) => ({ member, annotation: byId.get(member.annotationId) }));
  };

  const loadFinalizedSnapshot = async (version: number) => {
    const snapshot = await db.select().from(datasetSnapshots).where(eq(datasetSnapshots.version, version)).get();
    if (!snapshot) throw new Error("DATASET_NOT_FOUND");
    if (snapshot.status !== "finalized") throw new Error("DATASET_NOT_FINALIZED");
    return snapshot;
  };

  const annotationFields = (annotationId: string, annotation: typeof reviewedAnnotations.$inferSelect | undefined) => ({
    annotationId,
    fieldKey: annotation?.fieldKey as AdminDatasetDetailResponse["members"][number]["fieldKey"],
    reviewedValue: annotation?.reviewedValue ?? "",
    normalizedValue: annotation?.normalizedValue ?? null,
    originalOcrValue: annotation?.originalOcrValue ?? null,
    modelVersion: annotation?.modelVersion ?? null,
    layoutVersion: annotation?.layoutVersion ?? null,
  });

  return {
    async listAdminDatasetCandidates(input, _auth) {
      const { candidates } = await loadEligibility();
      const ids = candidates.map(({ annotation }) => annotation.id);
      const rows = ids.length ? await db.select({
        annotationId: reviewedAnnotations.id,
        fieldKey: reviewedAnnotations.fieldKey,
        reviewedValue: reviewedAnnotations.reviewedValue,
        submissionMapName: submissions.mapName,
      }).from(reviewedAnnotations)
        .innerJoin(submissions, eq(submissions.id, reviewedAnnotations.submissionId))
        .where(inArray(reviewedAnnotations.id, ids))
        .orderBy(desc(reviewedAnnotations.reviewedAt), desc(reviewedAnnotations.id)).all() : [];
      const page = Math.max(input.page, 1);
      const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
      const items = rows.slice((page - 1) * pageSize, page * pageSize).map((row) => ({
        annotationId: row.annotationId,
        fieldKey: row.fieldKey as AdminReviewedAnnotation["fieldKey"],
        reviewedValue: row.reviewedValue,
        submissionMapName: row.submissionMapName,
      }));
      return pageResult(items, page, pageSize, rows.length);
    },

    async createAdminDatasetDraft(input, auth, idempotencyKey): Promise<AdminDatasetCreateResponse> {
      const replay = await replayOrConflict<AdminDatasetCreateResponse>(auth.subject, "dataset.draft.create", idempotencyKey, input);
      if (replay) return replay;
      const eligibility = await loadEligibility();
      const excludedAnnotationIds = new Set(input.excludedAnnotationIds ?? []);
      const candidates = new Map(eligibility.candidates.map((candidate) => [candidate.annotation.id, candidate]));
      if ([...excludedAnnotationIds].some((annotationId) => !candidates.has(annotationId))) throw new Error("DATASET_ANNOTATION_EXCLUSION_INVALID");
      const members: Array<{ annotation: typeof reviewedAnnotations.$inferSelect; objectKey: string | null; contentType: string | null; available: boolean }> = [];
      const automaticExclusions = new Map(eligibility.exclusions.map((exclusion) => [exclusion.annotationId, exclusion.reason]));
      const exclusions: Array<{ annotationId: string; reason: string }> = [];
      for (const annotation of eligibility.accepted) {
        const candidate = candidates.get(annotation.id);
        if (!candidate) { exclusions.push({ annotationId: annotation.id, reason: automaticExclusions.get(annotation.id)! }); continue; }
        if (excludedAnnotationIds.has(annotation.id)) { exclusions.push({ annotationId: annotation.id, reason: "maintainer_excluded" }); continue; }
        members.push({ ...candidate, available: evidenceBucket ? Boolean(await evidenceBucket.head(candidate.objectKey)) : true });
      }
      const timestamp = now();
      const datasetId = crypto.randomUUID();
      const versionRow = await db.select({ version: datasetSnapshots.version }).from(datasetSnapshots)
        .orderBy(desc(datasetSnapshots.version)).limit(1).get();
      const version = (versionRow?.version ?? 0) + 1;
      const submissionCount = new Set(members.map((member) => member.annotation.submissionId)).size;
      const eligibilityJson = JSON.stringify({ eligibleCount: members.length, excludedCount: exclusions.length, submissionCount, annotationCount: members.length, exclusions });
      const statements: D1PreparedStatement[] = [
        database.prepare("INSERT INTO dataset_snapshots (id, version, status, created_by, created_at, note, eligibility_json) VALUES (?, ?, 'draft', ?, ?, ?, ?)").bind(datasetId, version, auth.subject, timestamp, input.note?.trim() ?? null, eligibilityJson),
        ...members.map((member, index) => database.prepare("INSERT INTO dataset_snapshot_annotations (snapshot_id, annotation_id, position, evidence_object_key, evidence_content_type, evidence_available) VALUES (?, ?, ?, ?, ?, ?)").bind(datasetId, member.annotation.id, index, member.objectKey, member.contentType, member.available ? 1 : 0)),
      ];
      const response: AdminDatasetCreateResponse = { contractVersion: "1", datasetId, version, status: "draft", counts: { eligibleCount: members.length, excludedCount: exclusions.length, submissionCount, annotationCount: members.length } };
      statements.push(database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'dataset.draft.create', ?, ?, ?)").bind(`${auth.subject}:dataset.draft.create:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(response), timestamp));
      statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'dataset.draft.created', 'dataset_snapshot', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, datasetId, JSON.stringify({ version, eligibleCount: members.length, excludedCount: exclusions.length, submissionCount, exclusions }), timestamp));
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      return response;
    },

    async listAdminDatasets(input, _auth): Promise<AdminDatasetListResponse> {
      const page = input.page >= 1 ? input.page : 1;
      const pageSize = Math.min(Math.max(input.pageSize >= 1 ? input.pageSize : 20, 1), 100);
      const condition = input.status ? eq(datasetSnapshots.status, input.status) : undefined;
      const totalRow = await db.select({ total: count() }).from(datasetSnapshots).where(condition).get();
      const rows = await db.select().from(datasetSnapshots).where(condition)
        .orderBy(desc(datasetSnapshots.createdAt)).limit(pageSize).offset((page - 1) * pageSize).all();
      const items: AdminDatasetListResponse["items"] = rows.map((row) => {
        const eligibility = JSON.parse(row.eligibilityJson) as {
          eligibleCount: number;
          excludedCount: number;
          submissionCount: number;
          annotationCount: number;
        };
        return snapshotCounts(row, eligibility);
      });
      return pageResult(items, page, pageSize, totalRow?.total ?? 0);
    },

    async getAdminDataset(input, _auth): Promise<AdminDatasetDetailResponse> {
      const snapshot = await db.select().from(datasetSnapshots).where(eq(datasetSnapshots.id, input.datasetId)).get();
      if (!snapshot) throw new Error("DATASET_NOT_FOUND");
      const eligibility = JSON.parse(snapshot.eligibilityJson) as {
        eligibleCount: number;
        excludedCount: number;
        submissionCount: number;
        annotationCount: number;
        exclusions?: Array<{ annotationId: string; reason: string }>;
      };
      const members = await loadSnapshotMembers(snapshot.id);
      return {
        contractVersion: "1",
        snapshot: snapshotCounts(snapshot, eligibility),
        members: members.map(({ member, annotation }) => ({
          ...annotationFields(member.annotationId, annotation),
          evidence: { available: member.evidenceAvailable === 1, contentType: member.evidenceContentType },
        })),
        exclusions: eligibility.exclusions ?? [],
      };
    },

    async finalizeAdminDataset(input, auth, idempotencyKey): Promise<AdminDatasetFinalizeResponse> {
      const replay = await replayOrConflict<AdminDatasetFinalizeResponse>(auth.subject, "dataset.finalize", idempotencyKey, input);
      if (replay) return replay;
      const snapshot = await db.select().from(datasetSnapshots).where(eq(datasetSnapshots.id, input.datasetId)).get();
      if (!snapshot) throw new Error("DATASET_NOT_FOUND");
      if (snapshot.status !== "draft") throw new Error("DATASET_ALREADY_FINALIZED");
      const timestamp = now();
      const response: AdminDatasetFinalizeResponse = { contractVersion: "1", datasetId: snapshot.id, version: snapshot.version, status: "finalized", finalizedAt: timestamp };
      await database.batch([
        database.prepare("UPDATE dataset_snapshots SET status = 'finalized', finalized_by = ?, finalized_at = ?, note = COALESCE(?, note) WHERE id = ? AND status = 'draft'").bind(auth.subject, timestamp, input.note?.trim() ?? null, snapshot.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'dataset.finalize', ?, ?, ?)").bind(`${auth.subject}:dataset.finalize:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'dataset.finalized', 'dataset_snapshot', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, snapshot.id, JSON.stringify({ version: snapshot.version }), timestamp),
      ]);
      return response;
    },

    // Keep the OCRKit view private and limit it to finalized snapshot facts.
    async getOcrkitDataset(input): Promise<OcrkitDatasetResponse> {
      const snapshot = await loadFinalizedSnapshot(input.version);
      const members = await loadSnapshotMembers(snapshot.id);
      return {
        contractVersion: "1",
        snapshot: { id: snapshot.id, version: snapshot.version, finalizedAt: snapshot.finalizedAt ?? 0, note: snapshot.note },
        members: members.map(({ member, annotation }) => ({
          ...annotationFields(member.annotationId, annotation),
          evidence: { id: member.annotationId, available: member.evidenceAvailable === 1, contentType: member.evidenceContentType },
        })),
      };
    },

    async getOcrkitDatasetEvidence(input): Promise<{ body: ArrayBuffer; contentType: string }> {
      if (!evidenceBucket) throw new Error("EVIDENCE_UNAVAILABLE");
      const snapshot = await loadFinalizedSnapshot(input.version);
      const member = await db.select().from(datasetSnapshotAnnotations)
        .where(and(eq(datasetSnapshotAnnotations.snapshotId, snapshot.id), eq(datasetSnapshotAnnotations.annotationId, input.annotationId))).get();
      if (!member?.evidenceObjectKey) throw new Error("EVIDENCE_NOT_FOUND");
      if (member.evidenceAvailable !== 1) throw new Error("EVIDENCE_UNAVAILABLE");
      const object = await evidenceBucket.get(member.evidenceObjectKey);
      if (!object) throw new Error("EVIDENCE_UNAVAILABLE");
      return { body: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? member.evidenceContentType ?? "image/png" };
    },
  };
};
