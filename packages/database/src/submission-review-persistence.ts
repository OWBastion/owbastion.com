import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import type { AdminSubmissionReviewResponse } from "@owbastion/contracts";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import { idempotencyKeys, submissions } from "./schema";
import type { VerifiedRunSubmissionOutcome } from "./submission-ocr-service";

type Dependencies = {
  loadVerifiedRunSubmissionOutcome: (submissionId: string) => Promise<VerifiedRunSubmissionOutcome | null>;
  reconcileVerifiedRunProgressChallenges: (input: { verifiedRunIds: string[]; actorId: string }) => Promise<void>;
  reconcilePlayerProgressChallenges: (input: { playerAccountIds: string[]; actorId: string }) => Promise<void>;
  progressReconcileQueue?: Queue;
};

export const createSubmissionReviewPersistence = (
  database: D1Database,
  db: ReturnType<typeof drizzle>,
  { loadVerifiedRunSubmissionOutcome, reconcileVerifiedRunProgressChallenges, reconcilePlayerProgressChallenges, progressReconcileQueue }: Dependencies,
) => {
  type SubmissionReviewWrite = {
    row: typeof submissions.$inferSelect;
    input: Parameters<PlatformServices["reviewSubmission"]>[0];
    auth: AuthContext;
    reviewId: string; timestamp: number;
    idempotencyKeyId: string; requestHash: string;
    response: AdminSubmissionReviewResponse; reviewAudit: unknown;
    statements: D1PreparedStatement[]; trailingStatements: D1PreparedStatement[];
  };

  const reconcileReviewedSubmissionProgress = async (submissionId: string, actorId: string) => {
    const outcome = await loadVerifiedRunSubmissionOutcome(submissionId);
    if (outcome?.verifiedRunId && (outcome.status === "created" || outcome.status === "reused")) {
      await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [outcome.verifiedRunId], actorId });
      return;
    }
    const submission = await db.select({ playerAccountId: submissions.playerAccountId }).from(submissions).where(eq(submissions.id, submissionId)).get();
    if (submission) await reconcilePlayerProgressChallenges({ playerAccountIds: [submission.playerAccountId], actorId });
  };

  // The queue consumer runs the same idempotent reconciliation; without a queue binding (unit tests) it runs inline.
  const scheduleProgress = async (submissionId: string, actorId: string) => {
    if (!progressReconcileQueue) return reconcileReviewedSubmissionProgress(submissionId, actorId);
    await progressReconcileQueue.send({ version: 1, submissionId, actorId });
  };

  // Approval may have committed before progress reconciliation was enqueued or ran; replaying the request repeats it.
  const replayReviewProgress = async <T extends { decision: string }>(replay: T, submissionId: string, actorId: string) => {
    if (replay.decision === "approved") await scheduleProgress(submissionId, actorId);
    return replay;
  };

  const persistSubmissionReview = async (review: SubmissionReviewWrite) => {
    await database.batch([
      database.prepare("INSERT INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, id, ?, ?, ?, ? FROM submissions WHERE id = ?").bind(review.reviewId, review.input.decision, review.input.reason ?? null, review.auth.subject, review.timestamp, review.row.id),
      ...review.statements,
      database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, 'submission.review', ?, ?, ? FROM submission_reviews WHERE id = ?").bind(review.idempotencyKeyId, review.auth.subject, review.requestHash, JSON.stringify(review.response), review.timestamp, review.reviewId),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'submission.review', 'submission', submission_id, ?, ? FROM submission_reviews WHERE id = ?").bind(crypto.randomUUID(), crypto.randomUUID(), review.auth.actorType, review.auth.subject, JSON.stringify(review.reviewAudit), review.timestamp, review.reviewId),
      ...review.trailingStatements,
    ] as [D1PreparedStatement, ...D1PreparedStatement[]]);
    if (!(await db.select({ id: idempotencyKeys.id }).from(idempotencyKeys).where(eq(idempotencyKeys.id, review.idempotencyKeyId)).get())) throw new Error("SUBMISSION_NOT_REVIEWABLE");
    if (review.input.decision === "approved") await scheduleProgress(review.row.id, review.auth.subject);
  };

  const reviewProgressServices: Pick<PlatformServices, "reconcileReviewedSubmissionProgress"> = {
    reconcileReviewedSubmissionProgress: ({ submissionId, actorId }) => reconcileReviewedSubmissionProgress(submissionId, actorId),
  };

  return { persistSubmissionReview, replayReviewProgress, reviewProgressServices };
};
