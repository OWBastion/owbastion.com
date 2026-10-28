import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { PlatformServices } from "@owbastion/domain";
import type { PlayerSubmissionStatus } from "@owbastion/contracts";
import { idempotencyKeys, playerAccounts, submissions, uploadSessions } from "./schema";
import { userEvidenceObjectKey } from "./object-key";
import { hashRequest, sha256Hex } from "./portal-session";

const uploadTtlMs = 10 * 60 * 1000;
const evidenceExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const maxUploadBytes = 10 * 1024 * 1024;
const playerUploadCompletionEnqueueingPrefix = "player-upload-completion-enqueueing:";

type PlayerUploadDependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  evidenceBucket?: R2Bucket;
  uploadOrigin: string;
  ocrQueue?: Queue;
  now: () => number;
  getCurrentPortalPlayer: (sessionToken: string) => Promise<{ player: typeof playerAccounts.$inferSelect } | null>;
  hashRequest: typeof hashRequest;
  logOcrEvent: (event: string, fields: Record<string, unknown>) => void;
  errorDetails: (error: unknown) => Record<string, string>;
};

export const createPlayerUploadServices = (dependencies: PlayerUploadDependencies): Pick<PlatformServices, "createPlayerUploadSession" | "uploadEvidence" | "completePlayerUpload"> => {
  const { database, db, evidenceBucket, uploadOrigin, ocrQueue, now, getCurrentPortalPlayer, hashRequest, logOcrEvent, errorDetails } = dependencies;
  const submissionStatus = async (submissionId: string) => {
    const submission = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, submissionId)).get();
    if (!submission) throw new Error("UPLOAD_SESSION_INVALID");
    return { submissionId, status: playerSubmissionStatus(submission.status) };
  };

  return {
    async createPlayerUploadSession(input, sessionToken) {
      const current = await getCurrentPortalPlayer(sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      const account = current.player;
      if (account.status === "banned") throw new Error("PLAYER_BANNED");
      const submissionId = crypto.randomUUID();
      const uploadId = crypto.randomUUID();
      const timestamp = now();
      const objectKey = userEvidenceObjectKey(submissionId, input.sha256, evidenceExtensions[input.contentType]);
      await db.insert(uploadSessions).values({ id: uploadId, submissionId, playerAccountId: account.id, contentType: input.contentType, byteSize: input.byteSize, sha256: input.sha256, objectKey, status: "pending", expiresAt: timestamp + uploadTtlMs, createdAt: timestamp });
      return { contractVersion: "1" as const, submissionId, uploadId, uploadUrl: `${uploadOrigin}/v1/uploads/${uploadId}`, expiresAt: timestamp + uploadTtlMs, maxBytes: maxUploadBytes };
    },

    async uploadEvidence(input, sessionToken) {
      if (!evidenceBucket) throw new Error("EVIDENCE_BUCKET_UNAVAILABLE");
      const session = await db.select().from(uploadSessions).where(eq(uploadSessions.id, input.uploadId)).get();
      if (!session || session.expiresAt <= now() || session.status !== "pending") throw new Error("UPLOAD_SESSION_INVALID");
      const current = await getCurrentPortalPlayer(sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      if (current.player.id !== session.playerAccountId) throw new Error("UPLOAD_SESSION_INVALID");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, session.playerAccountId)).get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");
      if (input.contentType !== session.contentType || input.body.byteLength !== session.byteSize || input.body.byteLength > maxUploadBytes) throw new Error("UPLOAD_METADATA_MISMATCH");
      const sha256 = await sha256Hex(input.body);
      if (sha256 !== session.sha256) throw new Error("UPLOAD_HASH_MISMATCH");
      await evidenceBucket.put(session.objectKey, input.body, { httpMetadata: { contentType: input.contentType } });
      const uploadedAt = now();
      await database.batch([
        database.prepare("UPDATE upload_sessions SET status = 'uploaded' WHERE id = ? AND status = 'pending' AND expires_at > ?").bind(session.id, uploadedAt),
        database.prepare(`INSERT OR IGNORE INTO submissions (id, player_account_id, binding_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, difficulty, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
          SELECT ?, ?, NULL, 'upload_pending', 'unknown', NULL, NULL, NULL, '成就挑战', NULL, ?, 'portal', 'portal', ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM upload_sessions WHERE id = ? AND status = 'uploaded')`)
          .bind(session.submissionId, account.id, account.playerName, session.id, uploadedAt, uploadedAt, session.id),
        database.prepare(`INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at)
          SELECT ?, ?, 'portal', ?, ?, ?, ?, ?, 'stored', ?
          WHERE EXISTS (SELECT 1 FROM upload_sessions WHERE id = ? AND status = 'uploaded')
            AND NOT EXISTS (SELECT 1 FROM attachments WHERE provider = 'portal' AND external_attachment_id = ?)`)
          .bind(crypto.randomUUID(), session.submissionId, session.id, input.contentType, input.body.byteLength, sha256, session.objectKey, uploadedAt, session.id, session.id),
      ]);
      const updatedSession = await db.select({ status: uploadSessions.status }).from(uploadSessions).where(eq(uploadSessions.id, session.id)).get();
      if (updatedSession?.status !== "uploaded") throw new Error("UPLOAD_SESSION_INVALID");
    },

    async completePlayerUpload(input, sessionToken, requestId) {
      const session = await db.select().from(uploadSessions).where(eq(uploadSessions.id, input.uploadId)).get();
      if (!session || !["uploaded", "completed"].includes(session.status) || (session.status === "uploaded" && session.expiresAt <= now())) throw new Error("UPLOAD_SESSION_INVALID");
      const current = await getCurrentPortalPlayer(sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      if (current.player.id !== session.playerAccountId) throw new Error("UPLOAD_SESSION_INVALID");
      if (!ocrQueue) {
        await database.batch([
          database.prepare("UPDATE upload_sessions SET status = 'completed' WHERE id = ? AND status = 'uploaded'").bind(session.id),
          database.prepare("UPDATE submissions SET status = 'ocr_pending', updated_at = ? WHERE id = ? AND status = 'upload_pending'").bind(now(), session.submissionId),
        ]);
        return submissionStatus(session.submissionId);
      }

      const requestHash = await hashRequest({ uploadId: session.id });
      const idempotencyRecordId = `${current.player.id}:submission.upload.complete:${session.id}`;
      const existingIdempotency = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyRecordId)).get();
      if (existingIdempotency) {
        if (existingIdempotency.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        if (existingIdempotency.responseJson.startsWith(playerUploadCompletionEnqueueingPrefix)) throw new Error("UPLOAD_COMPLETION_IN_PROGRESS");
        return JSON.parse(existingIdempotency.responseJson) as { submissionId: string; status: "processing" };
      }

      const beforeCompletion = await db.select({ status: submissions.status, updatedAt: submissions.updatedAt }).from(submissions).where(eq(submissions.id, session.submissionId)).get();
      if (!beforeCompletion) throw new Error("UPLOAD_SESSION_INVALID");
      const timestamp = Math.max(now(), beforeCompletion.updatedAt + 1);
      const jobId = crypto.randomUUID();
      const enqueueingMarker = `${playerUploadCompletionEnqueueingPrefix}${jobId}`;
      const response = { submissionId: session.submissionId, status: "processing" as const };
      await database.batch([
        database.prepare("UPDATE upload_sessions SET status = 'completed' WHERE id = ? AND status = 'uploaded'").bind(session.id),
        database.prepare("INSERT OR IGNORE INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'submission.upload.complete', ?, ?, ?)").bind(idempotencyRecordId, current.player.id, requestHash, enqueueingMarker, timestamp),
        database.prepare(`UPDATE submissions SET status = 'ocr_pending', updated_at = ?
          WHERE id = ? AND status = 'upload_pending' AND updated_at = ? AND changes() = 1
            AND EXISTS (SELECT 1 FROM upload_sessions WHERE id = ? AND submission_id = ? AND status = 'completed')`)
          .bind(timestamp, session.submissionId, beforeCompletion.updatedAt, session.id, session.submissionId),
        database.prepare("DELETE FROM idempotency_keys WHERE id = ? AND response_json = ? AND changes() = 0").bind(idempotencyRecordId, enqueueingMarker),
        database.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) SELECT ?, ?, 0, 'pending', ? WHERE EXISTS (SELECT 1 FROM idempotency_keys WHERE id = ? AND response_json = ?)").bind(jobId, session.submissionId, timestamp, idempotencyRecordId, enqueueingMarker),
      ]);
      const claimedIdempotency = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyRecordId)).get();
      if (!claimedIdempotency) {
        return submissionStatus(session.submissionId);
      }
      if (claimedIdempotency.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
      if (claimedIdempotency.responseJson !== enqueueingMarker) {
        if (claimedIdempotency.responseJson.startsWith(playerUploadCompletionEnqueueingPrefix)) throw new Error("UPLOAD_COMPLETION_IN_PROGRESS");
        return JSON.parse(claimedIdempotency.responseJson) as typeof response;
      }

      try {
        await ocrQueue.send({ version: 2, jobId, submissionId: session.submissionId, objectKey: session.objectKey, ...(requestId ? { requestId } : {}) });
        logOcrEvent("job_enqueued", { submissionId: session.submissionId, attempt: 0, manual: false, requestId: requestId ?? null });
      } catch (error) {
        logOcrEvent("job_enqueue_failed", { submissionId: session.submissionId, attempt: 0, manual: false, requestId: requestId ?? null, ...errorDetails(error) });
        const failedAt = Math.max(now(), timestamp + 1);
        try {
          await database.batch([
            database.prepare(`UPDATE submissions SET status = 'upload_pending', updated_at = ?
              WHERE id = ? AND status = 'ocr_pending' AND updated_at = ?
                AND EXISTS (SELECT 1 FROM idempotency_keys WHERE id = ? AND response_json = ?)`)
              .bind(failedAt, session.submissionId, timestamp, idempotencyRecordId, enqueueingMarker),
            database.prepare("UPDATE ocr_results SET status = 'error', error_code = 'OCR_QUEUE_SEND_FAILED' WHERE id = ? AND status = 'pending'").bind(jobId),
            database.prepare("DELETE FROM idempotency_keys WHERE id = ? AND response_json = ?").bind(idempotencyRecordId, enqueueingMarker),
          ]);
        } catch (recoveryError) {
          logOcrEvent("job_enqueue_recovery_failed", { submissionId: session.submissionId, attempt: 0, manual: false, requestId: requestId ?? null, ...errorDetails(recoveryError) });
        }
        throw error;
      }
      const finalizedIdempotency = await database.prepare("UPDATE idempotency_keys SET response_json = ? WHERE id = ? AND response_json = ?")
        .bind(JSON.stringify(response), idempotencyRecordId, enqueueingMarker)
        .run();
      if (Number(finalizedIdempotency.meta.changes) !== 1) throw new Error("UPLOAD_COMPLETION_IDEMPOTENCY_FINALIZE_FAILED");
      return response;
    },
  };
};

export const playerSubmissionStatus = (status: string): PlayerSubmissionStatus => {
  if (["upload_pending", "received", "evidence_pending", "evidence_stored", "ocr_pending"].includes(status)) return "processing";
  if (["awaiting_player_confirmation", "ready_for_review", "ocr_review_required"].includes(status)) return "needs_review";
  if (status === "approved") return "completed";
  if (["rejected", "resubmission_required"].includes(status)) return "rejected";
  throw new Error("SUBMISSION_STATUS_INVALID");
};
