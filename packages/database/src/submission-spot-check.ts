import { and, eq, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import type { AdminSubmissionSpotCheckResponse } from "@owbastion/contracts";
import type { PlatformServices } from "@owbastion/domain";
import { idempotencyKeys, playerTitleGrants, submissions, submissionSpotChecks, verifiedRuns } from "./schema";
import type { VerifiedRunSubmissionOutcome } from "./submission-ocr-service";

type Dependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  hashRequest: (value: unknown) => Promise<string>;
  replayOrConflict: <T>(db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  loadVerifiedRunSubmissionOutcome: (submissionId: string) => Promise<VerifiedRunSubmissionOutcome | null>;
  reconcileVerifiedRunProgressChallenges: (input: { verifiedRunIds: string[]; actorId: string; reason?: string }) => Promise<void>;
};

export const createSubmissionSpotCheckServices = ({ database, db, now, hashRequest, replayOrConflict, loadVerifiedRunSubmissionOutcome, reconcileVerifiedRunProgressChallenges }: Dependencies): Pick<PlatformServices, "resolveAdminSubmissionSpotCheck"> => ({
  async resolveAdminSubmissionSpotCheck(input, auth, idempotencyKey): Promise<AdminSubmissionSpotCheckResponse> {
    const operation = "submission.spot_check.resolve";
    const replay = await replayOrConflict<AdminSubmissionSpotCheckResponse>(db, auth.subject, operation, idempotencyKey, input);
    if (replay) {
      // The resolution batch already persisted idempotency, so a replay is
      // the only retry that can rerun the post-commit reconciliation after
      // a failed first attempt.
      if (input.decision === "revoked" && replay.verifiedRunId) {
        await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [replay.verifiedRunId], actorId: auth.subject, ...(input.reason ? { reason: input.reason } : {}) });
      }
      return replay;
    }
    const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
    if (!row) throw new Error("SUBMISSION_NOT_FOUND");
    const spotCheck = await db.select().from(submissionSpotChecks).where(eq(submissionSpotChecks.submissionId, row.id)).get();
    if (!spotCheck) throw new Error("SPOT_CHECK_NOT_FOUND");
    if (spotCheck.status !== "pending") throw new Error("SPOT_CHECK_ALREADY_RESOLVED");
    const timestamp = now();
    const grants = input.decision === "revoked"
      ? await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.sourceId, row.id), inArray(playerTitleGrants.sourceType, ["automatic", "submission"]), eq(playerTitleGrants.status, "active")))
      : [];
    const verifiedRunOutcome = await loadVerifiedRunSubmissionOutcome(row.id);
    const verifiedRun = input.decision === "revoked" && verifiedRunOutcome?.status === "created" && verifiedRunOutcome.verifiedRunId
      ? await db.select().from(verifiedRuns).where(and(eq(verifiedRuns.id, verifiedRunOutcome.verifiedRunId), eq(verifiedRuns.sourceSubmissionId, row.id), eq(verifiedRuns.status, "active"))).get()
      : null;
    if (input.decision === "revoked" && !grants.length && !verifiedRunOutcome) throw new Error("SUBMISSION_OUTCOME_NOT_FOUND");
    const response: AdminSubmissionSpotCheckResponse = { contractVersion: "1", submissionId: row.id, status: input.decision, grantId: row.grantId ?? null, verifiedRunId: verifiedRunOutcome?.verifiedRunId ?? null };
    const idempotencyKeyId = `${auth.subject}:${operation}:${idempotencyKey}`;
    const requestHash = await hashRequest(input);
    // Only the call whose spot-check update lands may apply the rest of the batch; a concurrent call that lost the race must change nothing.
    const won = "EXISTS (SELECT 1 FROM submission_spot_checks WHERE submission_id = ? AND status = ? AND resolved_at = ? AND reviewer = ?)";
    const wonBinds = [row.id, input.decision, timestamp, auth.subject];
    const revoked = input.decision === "revoked";
    const statements: D1PreparedStatement[] = [
      database.prepare("UPDATE submission_spot_checks SET status = ?, resolved_at = ?, reviewer = ?, reason = ? WHERE submission_id = ? AND status = 'pending'").bind(input.decision, timestamp, auth.subject, input.reason ?? null, row.id),
      ...(revoked ? [database.prepare(`UPDATE challenge_completions SET status = 'invalidated', invalidated_by = ?, invalidated_at = ?, invalidation_reason = ? WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'active' AND ${won}`).bind(auth.subject, timestamp, input.reason ?? "抽检判定称号完成证据无效", row.id, ...wonBinds)] : []),
      ...(revoked ? [database.prepare(`UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence', revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE status = 'active' AND ((source_id = ? AND source_type IN ('automatic', 'submission')) OR completion_id IN (SELECT id FROM challenge_completions WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'invalidated')) AND ${won}`).bind(auth.subject, timestamp, input.reason ?? "抽检撤销自动授予的称号", row.id, row.id, ...wonBinds)] : []),
      ...(revoked && verifiedRun ? [
        database.prepare(`UPDATE mastery_runs SET status = 'invalidated', invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ? AND status = 'active' AND ${won}`).bind(timestamp, auth.subject, input.reason ?? "抽检判定证据无效", verifiedRun.id, ...wonBinds),
        database.prepare(`INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) SELECT ?, ?, 'invalidated', ?, ?, ?, ? WHERE ${won}`).bind(crypto.randomUUID(), verifiedRun.id, auth.actorType, auth.subject, input.reason ?? "抽检判定证据无效", timestamp, ...wonBinds),
        database.prepare(`UPDATE submission_outcomes SET status = 'invalidated', updated_at = ? WHERE submission_id = ? AND outcome_key = 'verified_run' AND status = 'created' AND ${won}`).bind(timestamp, row.id, ...wonBinds),
      ] : []),
      database.prepare(`INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ${won}`).bind(idempotencyKeyId, auth.subject, operation, requestHash, JSON.stringify(response), timestamp, ...wonBinds),
      database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, ?, 'submission', ?, ?, ? WHERE ${won}`).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, revoked ? "submission.spot_check.revoked" : "submission.spot_check.confirmed", row.id, JSON.stringify({ decision: input.decision, reason: input.reason ?? null, grantId: row.grantId ?? null, verifiedRunId: verifiedRunOutcome?.verifiedRunId ?? null, masteryInvalidated: Boolean(verifiedRun) }), timestamp, ...wonBinds),
      ...grants.map((grant) => database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'title_grant.revoke', 'player_title_grant', ?, ?, ? WHERE ${won}`).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grant.id, JSON.stringify({ submissionId: row.id, reason: input.reason ?? "抽检撤销自动授予的称号", sourceType: grant.sourceType, revocationType: "evidence" }), timestamp, ...wonBinds)),
      ...(revoked && verifiedRun ? [database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'mastery_run.invalidate', 'verified_run', ?, ?, ? WHERE ${won}`).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, verifiedRun.id, JSON.stringify({ submissionId: row.id, reason: input.reason ?? "抽检判定证据无效" }), timestamp, ...wonBinds)] : []),
    ];
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    if (!(await db.select({ id: idempotencyKeys.id }).from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyKeyId)).get())) throw new Error("SPOT_CHECK_ALREADY_RESOLVED");
    if (revoked && verifiedRun) await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [verifiedRun.id], actorId: auth.subject, ...(input.reason ? { reason: input.reason } : {}) });
    return response;
  },
});
