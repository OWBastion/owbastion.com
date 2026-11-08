import { and, desc, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import type { AdminSubmissionOcrReevaluateResponse } from "@owbastion/contracts";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { OcrResponse } from "./ocr-response";
import { ocrResults, submissions } from "./schema";

type Dependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  completeOcrResult: (row: typeof submissions.$inferSelect, ocrResult: OcrResponse, input: { attempt: number; manual: boolean; requestId: string }) => Promise<void>;
  replayOrConflict: <T>(db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
};

export const createSubmissionOcrReevaluation = ({ database, db, now, completeOcrResult, replayOrConflict, recordIdempotency }: Dependencies): Pick<PlatformServices, "reevaluateAdminSubmissionOcr"> => ({
  async reevaluateAdminSubmissionOcr(input, auth: AuthContext, idempotencyKey): Promise<AdminSubmissionOcrReevaluateResponse> {
    const operation = "submission.ocr.reevaluate";
    const replay = await replayOrConflict<AdminSubmissionOcrReevaluateResponse>(db, auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
    if (!row) throw new Error("SUBMISSION_NOT_FOUND");
    if (row.status !== "ocr_review_required") throw new Error("SUBMISSION_NOT_REEVALUABLE");
    const latest = await db.select({ responseJson: ocrResults.responseJson }).from(ocrResults)
      .where(and(eq(ocrResults.submissionId, row.id), eq(ocrResults.status, "review_required")))
      .orderBy(desc(ocrResults.createdAt), desc(ocrResults.id)).limit(1).get();
    let stored: OcrResponse | null = null;
    try { stored = latest?.responseJson ? JSON.parse(latest.responseJson) as OcrResponse : null; } catch { stored = null; }
    if (!stored) throw new Error("SUBMISSION_NOT_REEVALUABLE");

    // Re-run the decision from the stored recognition (no OCRKit call): reopen the
    // submission as pending with a fresh result row, then let the normal completion
    // path decide again against today's catalog, modes and revisions.
    const timestamp = Math.max(now(), row.updatedAt + 1);
    const pendingResultId = crypto.randomUUID();
    await database.batch([
      database.prepare("UPDATE submissions SET status = 'ocr_pending', review_reason = NULL, updated_at = ? WHERE id = ? AND status = 'ocr_review_required' AND updated_at = ?").bind(timestamp, row.id, row.updatedAt),
      // No queue callback exists for this result, so it is inserted already claimed: persisting a decision requires the claim.
      database.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, manual, callback_claimed, created_at) SELECT ?, ?, 0, 'pending', 1, 1, ? WHERE changes() = 1").bind(pendingResultId, row.id, timestamp),
      database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at)
        SELECT ?, ?, ?, ?, ?, 'submission', ?, '{}', ? WHERE changes() = 1`).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, row.id, timestamp),
    ]);
    const reopened = await db.select({ id: ocrResults.id }).from(ocrResults).where(eq(ocrResults.id, pendingResultId)).get();
    if (!reopened) throw new Error("SUBMISSION_NOT_REEVALUABLE");
    try {
      await completeOcrResult({ ...row, status: "ocr_pending", reviewReason: null, updatedAt: timestamp }, stored, { requestId: pendingResultId, attempt: 0, manual: true });
    } catch (error) {
      // No queue message retries this result, so return the submission to the review hold it came from.
      await database.batch([
        database.prepare("UPDATE ocr_results SET status = 'error', error_code = 'OCR_REEVALUATE_FAILED', callback_claimed = 0 WHERE id = ? AND status = 'pending'").bind(pendingResultId),
        database.prepare(`UPDATE submissions SET status = 'ocr_review_required', review_reason = ?, updated_at = ?
          WHERE id = ? AND status = 'ocr_pending' AND EXISTS (SELECT 1 FROM ocr_results WHERE id = ? AND status = 'error')`).bind(row.reviewReason, Math.max(now(), timestamp + 1), row.id, pendingResultId),
      ]);
      throw error;
    }
    const after = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, row.id)).get();
    const response: AdminSubmissionOcrReevaluateResponse = { contractVersion: "1", submissionId: row.id, status: after?.status ?? "ocr_pending" };
    await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
    return response;
  },
});
